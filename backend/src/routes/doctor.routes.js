const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const prisma = require('../config/prisma');
const authenticateToken = require('../middleware/authenticate');
const { vaultLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { recordSchema } = require('../schemas/doctor.schema');
const { vaultAccessSchema } = require('../schemas/vault.schema');

const { lookupAccessCode, decryptRecords, createEncryptedRecord, createAuditLog } = require('../services/vault.service');

// GET /api/doctor/dashboard
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') {
            return res.status(403).json({ error: "Access Denied: Doctor clearance required." });
        }

        const doctorData = await prisma.doctor.findUnique({
            where: { userId: req.user.id },
            include: {
                appointments: {
                    include: { patient: true }
                },
                user: {
                    select: {
                        isTwoFactorEnabled: true,
                        passkeys: { select: { id: true, deviceType: true } },
                    },
                },
            }
        });

        if (!doctorData) {
            return res.status(404).json({ error: "Doctor profile not found" });
        }

        res.json(doctorData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch doctor dashboard data" });
    }
});

// POST /api/doctor/access-vault
router.post('/access-vault', authenticateToken, vaultLimiter, validate(vaultAccessSchema), async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });

        const { code } = req.body;

        const validCode = await lookupAccessCode(code);
        if (!validCode) return res.status(404).json({ error: "Invalid code." });

        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const patientUser = await prisma.patient.findUnique({
            where: { id: validCode.patientId },
            select: { userId: true }
        });
        if (!patientUser) return res.status(404).json({ error: "Patient not found." });

        const io = req.io;
        io.to(patientUser.userId).emit('auth-request', {
            doctorName: `Dr. ${doctor.lastName}`,
            code: code
        });

        let responded = false;
        const eventName = `auth-resolved-${code}`;
        const app = req.app;

        const timeout = setTimeout(() => {
            if (!responded) {
                app.removeAllListeners(eventName);
                res.status(408).json({ error: "Patient did not respond to the approval request." });
            }
        }, 30000);

        app.once(eventName, async (authData) => {
            responded = true;
            clearTimeout(timeout);

            // This callback runs OUTSIDE the route's try/catch (it fires later, on an
            // event). Any throw here would be an unhandled rejection and crash the whole
            // server, so it must guard itself.
            try {
                if (authData.approved) {
                    // Consume the access code — it can never be reused. deleteMany is
                    // idempotent: if the code was already consumed (e.g. a duplicate
                    // request), it returns count 0 instead of throwing P2025.
                    const consumed = await prisma.accessCode.deleteMany({ where: { id: validCode.id } });
                    if (consumed.count === 0) {
                        return res.status(409).json({ error: "This access request was already used. Please ask the patient for a new code." });
                    }

                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 10;
                const skip = (page - 1) * limit;

                const patientData = await prisma.patient.findUnique({
                    where: { id: validCode.patientId },
                    include: {
                        medicalRecords: { 
                            include: { doctor: true },
                            orderBy: { createdAt: 'desc' }
                        }
                    }
                });

                // Filter to only the records the patient explicitly approved sharing
                const sharedRecordIds = Array.isArray(authData.sharedRecordIds) ? authData.sharedRecordIds : [];
                const approvedRecords = patientData.medicalRecords.filter(record =>
                    sharedRecordIds.includes(record.id)
                );

                // Paginate and decrypt the approved records
                const totalRecords = approvedRecords.length;
                const paginatedRecords = approvedRecords.slice(skip, skip + limit);
                decryptRecords(paginatedRecords);
                patientData.medicalRecords = paginatedRecords;

                const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
                await createAuditLog({
                    userId: doctor.userId,
                    action: 'VAULT_ACCESSED',
                    details: { patientId: validCode.patientId, approvedRecords: sharedRecordIds.length },
                    ipAddress: rawIp
                });

                // Issue a short-lived vault session token so the doctor can add records
                // even though the access code is now consumed
                const vaultToken = jwt.sign(
                    { patientId: validCode.patientId, doctorId: doctor.id },
                    process.env.JWT_SECRET,
                    { expiresIn: '15m' }
                );

                // Let the patient know their doctor is now actively viewing the records
                // they just shared.
                req.io.to(patientUser.userId).emit('vault-viewing-started', {
                    doctorName: `Dr. ${doctor.lastName}`
                });

                res.json({
                    patient: patientData,
                    vaultToken,
                    pagination: {
                        page,
                        limit,
                        total: totalRecords,
                        hasMore: skip + limit < totalRecords
                    }
                });
                } else {
                    res.status(403).json({ error: "Access explicitly denied by patient." });
                }
            } catch (err) {
                console.error("🚨 Vault approval handler failed:", err);
                if (!res.headersSent) {
                    res.status(500).json({ error: "Failed to finalize vault access." });
                }
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to access vault." });
    }
});

// POST /api/doctor/records
router.post('/records', authenticateToken, validate(recordSchema), async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });

        const { patientId, vaultToken, diagnosis, treatment, notes } = req.body;

        // Validate the vault session token (issued during access-vault)
        let vaultSession;
        try {
            vaultSession = jwt.verify(vaultToken, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(403).json({ error: "Vault session expired. Please re-enter a new access code." });
        }

        // Ensure the token matches the claimed patient and the requesting doctor
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
        if (vaultSession.patientId !== patientId || vaultSession.doctorId !== doctor.id) {
            return res.status(403).json({ error: "Vault session mismatch. Access denied." });
        }

        const newRecord = await createEncryptedRecord({
            diagnosis, treatment, notes,
            patientId: vaultSession.patientId,
            doctorId: doctor.id
        });

        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        await createAuditLog({
            userId: req.user.id,
            action: 'RECORD_ADDED',
            details: { patientId: vaultSession.patientId, recordId: newRecord.id },
            ipAddress: rawIp
        });

        try {
            const io = req.io;
            const patientForSocket = await prisma.patient.findUnique({
                where: { id: vaultSession.patientId },
                select: { userId: true }
            });
            if (patientForSocket) {
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`🚨 PINGING PATIENT ROOM: ${patientForSocket.userId}`);
                }
                // Emit the decrypted record — newRecord contains ciphertext from the DB
                const decryptedRecord = {
                    ...newRecord,
                    diagnosis,
                    treatment,
                    notes: notes || null,
                    doctor: { lastName: doctor.lastName }
                };
                io.to(patientForSocket.userId).emit('vault-updated', { newRecord: decryptedRecord });
            }
        } catch (socketError) {
            console.error("WEBSOCKET ERROR:", socketError);
        }

        res.json({ message: "Record added successfully and vault locked." });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add record." });
    }
});

// POST /api/doctor/lock-vault
// Best-effort notification that the doctor has stopped viewing — clears the
// "doctor is viewing" banner on the patient's screen. Never errors hard.
router.post('/lock-vault', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });

        const { vaultToken } = req.body;
        let session;
        try {
            session = jwt.verify(vaultToken, process.env.JWT_SECRET);
        } catch (err) {
            // Token already expired — nothing left to notify about.
            return res.json({ ok: true });
        }

        const patient = await prisma.patient.findUnique({
            where: { id: session.patientId },
            select: { userId: true }
        });
        if (patient) {
            req.io.to(patient.userId).emit('vault-viewing-ended');
        }

        res.json({ ok: true });
    } catch (error) {
        console.error("lock-vault notification failed:", error);
        res.json({ ok: true });
    }
});

module.exports = router;
