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
                }
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

            if (authData.approved) {
                // Immediately consume the access code — it can never be reused
                await prisma.accessCode.delete({ where: { id: validCode.id } });

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
                const approvedRecords = patientData.medicalRecords.filter(record =>
                    authData.sharedRecordIds.includes(record.id)
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
                    details: { patientId: validCode.patientId, approvedRecords: authData.sharedRecordIds.length },
                    ipAddress: rawIp
                });

                // Issue a short-lived vault session token so the doctor can add records
                // even though the access code is now consumed
                const vaultToken = jwt.sign(
                    { patientId: validCode.patientId, doctorId: doctor.id },
                    process.env.JWT_SECRET,
                    { expiresIn: '15m' }
                );

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
                io.to(patientForSocket.userId).emit('vault-updated', { newRecord });
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

module.exports = router;
