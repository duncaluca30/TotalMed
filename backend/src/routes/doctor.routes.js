const express = require('express');
const router = express.Router();

const prisma = require('../config/prisma');
const authenticateToken = require('../middleware/authenticate');
const { vaultLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { recordSchema } = require('../schemas/doctor.schema');
const { decrypt } = require('../../utils/cipher');

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
router.post('/access-vault', authenticateToken, vaultLimiter, async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });

        const { code } = req.body;
        if (!code) return res.status(400).json({ error: "Please enter a 6-digit access code." });

        // Sanitize — reject anything that isn't exactly 6 digits
        if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "Access code must be exactly 6 digits." });

        const activeCodes = await prisma.accessCode.findMany({
            where: { expiresAt: { gt: new Date() } }
        });

        let validCode = null;
        for (const record of activeCodes) {
            const decryptedCode = decrypt(record.code);
            if (decryptedCode === code) {
                validCode = record;
                break;
            }
        }

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

                // Paginate the approved records
                const totalRecords = approvedRecords.length;
                const paginatedRecords = approvedRecords.slice(skip, skip + limit);

                patientData.medicalRecords = paginatedRecords;

                const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
                await prisma.auditLog.create({
                    data: {
                        userId: doctor.userId,
                        action: 'VAULT_ACCESSED',
                        details: JSON.stringify({ patientId: validCode.patientId, approvedRecords: authData.sharedRecordIds.length }),
                        ipAddress: rawIp ? rawIp.split(',')[0].trim() : null
                    }
                });

                res.json({ 
                    patient: patientData, 
                    vaultKey: code,
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

        const { patientId, code, diagnosis, treatment, notes } = req.body;

        const patientCodes = await prisma.accessCode.findMany({ 
            where: { patientId: patientId } 
        });

        let validCode = null;
        for (const record of patientCodes) {
            if (decrypt(record.code) === code) {
                validCode = record;
                break;
            }
        }

        if (!validCode) {
            return res.status(403).json({ error: "Invalid or expired authorization code." });
        }

        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const newRecord = await prisma.medicalRecord.create({
            data: {
                diagnosis,
                treatment,
                notes: notes ? encrypt(notes) : null,
                patientId: validCode.patientId,
                doctorId: doctor.id
            }
        });

        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        await prisma.auditLog.create({
            data: {
                userId: req.user.id,
                action: 'RECORD_ADDED',
                details: JSON.stringify({ patientId: validCode.patientId, recordId: newRecord.id }),
                ipAddress: rawIp ? rawIp.split(',')[0].trim() : null
            }
        });

        await prisma.accessCode.delete({ where: { id: validCode.id } });

        try {
            const io = req.io;
            // Look up userId so we emit to the correct socket room
            const patientForSocket = await prisma.patient.findUnique({
                where: { id: validCode.patientId },
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
