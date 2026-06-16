const express = require('express');
const router = express.Router();

const prisma = require('../config/prisma');
const authenticateToken = require('../middleware/authenticate');
const { getDecryptedRecords, generateAccessCode } = require('../services/vault.service');
const { decrypt } = require('../../utils/cipher');

// GET /api/patient/dashboard
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied" });

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const patientData = await prisma.patient.findUnique({
            where: { userId: req.user.id },
            include: {
                user: { select: { isTwoFactorEnabled: true } },
                accessCode: true,
            }
        });

        if (!patientData) return res.status(404).json({ error: "Profile not found" });

        // Fetch decrypted, paginated records via service
        const { records, total } = await getDecryptedRecords(patientData.id, page, limit);
        patientData.medicalRecords = records;

        if (patientData.accessCode) {
            patientData.accessCode.code = decrypt(patientData.accessCode.code);
        }

        res.json({
            ...patientData,
            pagination: {
                page,
                limit,
                total,
                hasMore: (page - 1) * limit + limit < total
            }
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch dashboard" });
    }
});

// POST /api/patient/generate-code
router.post('/generate-code', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });

        const patient = await prisma.patient.findUnique({ where: { userId: req.user.id } });
        if (!patient) return res.status(404).json({ error: "Patient profile not found." });

        const result = await generateAccessCode(patient.id);
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to generate access code" });
    }
});

module.exports = router;
