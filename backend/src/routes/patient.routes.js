const express = require('express');
const router = express.Router();

const prisma = require('../config/prisma');
const authenticateToken = require('../middleware/authenticate');
const { decrypt } = require('../../utils/cipher');
const { encrypt } = require('../../utils/cipher');

// GET /api/patient/dashboard
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied" });

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const patientData = await prisma.patient.findUnique({
            where: { userId: req.user.id },
            include: {
                user: { select: { isTwoFactorEnabled: true } },
                accessCode: true,
            }
        });

        if (!patientData) return res.status(404).json({ error: "Profile not found" });

        // Get total count for pagination
        const totalRecords = await prisma.medicalRecord.count({
            where: { patientId: patientData.id }
        });

        // Get paginated records
        const medicalRecords = await prisma.medicalRecord.findMany({
            where: { patientId: patientData.id },
            include: { doctor: true },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit
        });

        patientData.medicalRecords = medicalRecords;

        if (patientData.accessCode) {
            patientData.accessCode.code = decrypt(patientData.accessCode.code);
        }

        res.json({
            ...patientData,
            pagination: {
                page,
                limit,
                total: totalRecords,
                hasMore: skip + limit < totalRecords
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

        const existingCode = await prisma.accessCode.findUnique({
            where: { patientId: patient.id }
        });

        if (existingCode) {
            if (new Date() < existingCode.expiresAt) {
                const decryptedCode = decrypt(existingCode.code);
                return res.json({ code: decryptedCode, expiresAt: existingCode.expiresAt });
            } else {
                await prisma.accessCode.delete({ where: { id: existingCode.id } });
            }
        }

        const generatePin = () => Math.floor(100000 + Math.random() * 900000).toString();
        let uniqueCode = generatePin();
        let encryptedCode = encrypt(uniqueCode);

        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 60);

        const newCode = await prisma.accessCode.create({
            data: {
                code: encryptedCode,
                expiresAt: expiresAt,
                patientId: patient.id
            }
        });

        res.json({ code: uniqueCode, expiresAt: newCode.expiresAt });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to generate access code" });
    }
});

module.exports = router;
