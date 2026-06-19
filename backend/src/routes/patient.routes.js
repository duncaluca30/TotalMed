const express = require('express');
const router = express.Router();

const prisma = require('../config/prisma');
const authenticateToken = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { getDecryptedRecords, generateAccessCode } = require('../services/vault.service');
const { revokeVaultAccess } = require('../services/vaultRevocations');
const { allergySchema, medicationSchema, birthSchema, patientProfileSchema } = require('../schemas/health.schema');
const health = require('../services/health.service');
const { decrypt } = require('../../utils/cipher');

// Resolve the authenticated patient's profile id (or null). Used by the
// self-service allergy/medication endpoints so a patient can only ever touch
// their own data.
async function getPatientId(userId) {
    const patient = await prisma.patient.findUnique({
        where: { userId },
        select: { id: true }
    });
    return patient ? patient.id : null;
}

// GET /api/patient/dashboard
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied" });

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const patientData = await prisma.patient.findUnique({
            where: { userId: req.user.id },
            include: {
                user: {
                    select: {
                        isTwoFactorEnabled: true,
                        passkeys: { select: { id: true, deviceType: true } },
                    },
                },
                accessCode: true,
            }
        });

        if (!patientData) return res.status(404).json({ error: "Profile not found" });

        // Fetch decrypted, paginated records via service
        const { records, total } = await getDecryptedRecords(patientData.id, page, limit);
        patientData.medicalRecords = records;

        // Allergies and current medications are small, patient-level lists —
        // always returned in full (decrypted), not paginated.
        patientData.allergies = await health.getDecryptedAllergies(patientData.id);
        patientData.medications = await health.getDecryptedMedications(patientData.id);
        patientData.births = await health.getBirths(patientData.id);

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

// POST /api/patient/revoke-access
// Immediately invalidates any active vault session for this patient, so a doctor
// who was mid-visit can no longer add records. Already-loaded records on the
// doctor's screen cannot be recalled (they were transmitted on grant).
router.post('/revoke-access', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });

        const patient = await prisma.patient.findUnique({
            where: { userId: req.user.id },
            select: { id: true }
        });
        if (!patient) return res.status(404).json({ error: "Patient profile not found." });

        revokeVaultAccess(patient.id);
        res.json({ message: "Access revoked." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to revoke access." });
    }
});

// ── Allergies (patient self-service) ─────────────────────────────────────────

// POST /api/patient/allergies
router.post('/allergies', authenticateToken, validate(allergySchema), async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const { substance, reaction, severity } = req.body;
        const allergy = await health.createAllergy({ patientId, substance, reaction, severity });
        res.status(201).json(allergy);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add allergy." });
    }
});

// PUT /api/patient/allergies/:id
router.put('/allergies/:id', authenticateToken, validate(allergySchema), async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const { substance, reaction, severity } = req.body;
        const allergy = await health.updateAllergy({ id: req.params.id, patientId, substance, reaction, severity });
        if (!allergy) return res.status(404).json({ error: "Allergy not found." });
        res.json(allergy);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update allergy." });
    }
});

// DELETE /api/patient/allergies/:id
router.delete('/allergies/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const deleted = await health.deleteAllergy({ id: req.params.id, patientId });
        if (!deleted) return res.status(404).json({ error: "Allergy not found." });
        res.json({ message: "Allergy removed." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to remove allergy." });
    }
});

// ── Medications (patient self-service) ────────────────────────────────────────

// POST /api/patient/medications
router.post('/medications', authenticateToken, validate(medicationSchema), async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const { name, dosage, frequency } = req.body;
        const medication = await health.createMedication({ patientId, name, dosage, frequency });
        res.status(201).json(medication);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add medication." });
    }
});

// PUT /api/patient/medications/:id
router.put('/medications/:id', authenticateToken, validate(medicationSchema), async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const { name, dosage, frequency } = req.body;
        const medication = await health.updateMedication({ id: req.params.id, patientId, name, dosage, frequency });
        if (!medication) return res.status(404).json({ error: "Medication not found." });
        res.json(medication);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update medication." });
    }
});

// DELETE /api/patient/medications/:id
router.delete('/medications/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const deleted = await health.deleteMedication({ id: req.params.id, patientId });
        if (!deleted) return res.status(404).json({ error: "Medication not found." });
        res.json({ message: "Medication removed." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to remove medication." });
    }
});

// ── Gynecological profile (patient self-service) ─────────────────────────────

// PUT /api/patient/profile — patch sex / menopause / menarche
router.put('/profile', authenticateToken, validate(patientProfileSchema), async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const { sex, atMenopause, menarcheDate } = req.body;
        const updated = await health.updatePatientProfile(patientId, { sex, atMenopause, menarcheDate });
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update profile." });
    }
});

// POST /api/patient/births
router.post('/births', authenticateToken, validate(birthSchema), async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const { modality, year } = req.body;
        const birth = await health.createBirth({ patientId, modality, year });
        res.status(201).json(birth);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add birth." });
    }
});

// PUT /api/patient/births/:id
router.put('/births/:id', authenticateToken, validate(birthSchema), async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const { modality, year } = req.body;
        const birth = await health.updateBirth({ id: req.params.id, patientId, modality, year });
        if (!birth) return res.status(404).json({ error: "Birth not found." });
        res.json(birth);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update birth." });
    }
});

// DELETE /api/patient/births/:id
router.delete('/births/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const deleted = await health.deleteBirth({ id: req.params.id, patientId });
        if (!deleted) return res.status(404).json({ error: "Birth not found." });
        res.json({ message: "Birth removed." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to remove birth." });
    }
});

module.exports = router;
