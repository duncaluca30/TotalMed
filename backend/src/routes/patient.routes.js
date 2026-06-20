const express = require('express');
const router = express.Router();

const prisma = require('../config/prisma');
const authenticateToken = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { getDecryptedRecords, generateAccessCode, getPatientAccessLog } = require('../services/vault.service');
const { revokeVaultAccess } = require('../services/vaultRevocations');
const { allergySchema, medicationSchema, birthSchema, patientProfileSchema, appointmentSchema } = require('../schemas/health.schema');
const health = require('../services/health.service');
const attachments = require('../services/attachment.service');
const { buildFhirBundle } = require('../services/export.service');
const { createAuditLog } = require('../services/vault.service');
const { singleFile } = require('../middleware/upload');
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
        patientData.appointments = await health.getDecryptedAppointments(patientData.id);

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

// GET /api/patient/access-log — who accessed this patient's data, and when
router.get('/access-log', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const logs = await getPatientAccessLog(patientId);
        res.json({ logs });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load access log." });
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

        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        await createAuditLog({ userId: req.user.id, action: 'ALLERGY_ADDED', details: { patientId, allergyId: allergy.id }, ipAddress: rawIp });

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

        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        await createAuditLog({ userId: req.user.id, action: 'MEDICATION_ADDED', details: { patientId, medicationId: medication.id }, ipAddress: rawIp });

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

// ── Appointment reminders (patient self-service) ─────────────────────────────

// POST /api/patient/appointments
router.post('/appointments', authenticateToken, validate(appointmentSchema), async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const { dateTime, specialty, location, reason } = req.body;
        const appointment = await health.createAppointment({ patientId, dateTime, specialty, location, reason });
        res.status(201).json(appointment);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add appointment." });
    }
});

// PUT /api/patient/appointments/:id
router.put('/appointments/:id', authenticateToken, validate(appointmentSchema), async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const { dateTime, specialty, location, reason } = req.body;
        const appointment = await health.updateAppointment({ id: req.params.id, patientId, dateTime, specialty, location, reason });
        if (!appointment) return res.status(404).json({ error: "Appointment not found." });
        res.json(appointment);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update appointment." });
    }
});

// DELETE /api/patient/appointments/:id
router.delete('/appointments/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const deleted = await health.deleteAppointment({ id: req.params.id, patientId });
        if (!deleted) return res.status(404).json({ error: "Appointment not found." });
        res.json({ message: "Appointment removed." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to remove appointment." });
    }
});

// ── Data portability (GDPR) ──────────────────────────────────────────────────

// GET /api/patient/export — download the full history as a FHIR-style JSON Bundle.
router.get('/export', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const bundle = await buildFhirBundle(patientId);
        if (!bundle) return res.status(404).json({ error: "Patient profile not found." });

        res.setHeader('Content-Type', 'application/fhir+json');
        res.setHeader('Content-Disposition', 'attachment; filename="totalmed-export.json"');
        res.send(JSON.stringify(bundle, null, 2));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to export data." });
    }
});

// ── Attachments (patient self-service) ───────────────────────────────────────

// POST /api/patient/attachments — upload a file against one of the patient's
// own records (multipart/form-data: file + recordId).
router.post('/attachments', authenticateToken, singleFile('file'), async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        if (!req.file) return res.status(400).json({ error: "No file uploaded." });
        const { recordId } = req.body;
        if (!recordId) return res.status(400).json({ error: "recordId is required." });

        if (!(await attachments.recordBelongsToPatient(recordId, patientId))) {
            return res.status(404).json({ error: "Record not found." });
        }

        const meta = await attachments.createAttachment({
            recordId,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            buffer: req.file.buffer
        });

        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        await createAuditLog({ userId: req.user.id, action: 'ATTACHMENT_ADDED', details: { patientId, attachmentId: meta.id, recordId }, ipAddress: rawIp });

        res.status(201).json(meta);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to upload attachment." });
    }
});

// GET /api/patient/attachments/:id/download — stream the decrypted file.
router.get('/attachments/:id/download', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const file = await attachments.getDataForPatient(req.params.id, patientId);
        if (!file) return res.status(404).json({ error: "Attachment not found." });

        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
        res.send(file.buffer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to download attachment." });
    }
});

// DELETE /api/patient/attachments/:id
router.delete('/attachments/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const deleted = await attachments.deleteForPatient(req.params.id, patientId);
        if (!deleted) return res.status(404).json({ error: "Attachment not found." });
        res.json({ message: "Attachment removed." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to remove attachment." });
    }
});

// ── Account deletion (right to be forgotten) ─────────────────────────────────

// DELETE /api/patient/account — permanently erase the patient and all their data
router.delete('/account', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const userId = req.user.id;
        const patient = await prisma.patient.findUnique({ where: { userId }, select: { id: true } });
        if (!patient) return res.status(404).json({ error: "Patient profile not found." });
        const patientId = patient.id;

        // Delete child rows first (no cascade configured), then the patient, then
        // the user's own auth artifacts and the user record itself — all atomically.
        // Attachments reference medical records (FK), so they must be cleared
        // before the records they hang off.
        const recordIds = (await prisma.medicalRecord.findMany({
            where: { patientId }, select: { id: true }
        })).map(r => r.id);

        await prisma.$transaction([
            prisma.notification.deleteMany({ where: { userId } }),
            prisma.attachment.deleteMany({ where: { recordId: { in: recordIds } } }),
            prisma.appointment.deleteMany({ where: { patientId } }),
            prisma.medicalRecord.deleteMany({ where: { patientId } }),
            prisma.allergy.deleteMany({ where: { patientId } }),
            prisma.medication.deleteMany({ where: { patientId } }),
            prisma.birth.deleteMany({ where: { patientId } }),
            prisma.accessCode.deleteMany({ where: { patientId } }),
            prisma.patient.delete({ where: { id: patientId } }),
            prisma.passkey.deleteMany({ where: { userId } }),
            prisma.auditLog.deleteMany({ where: { userId } }),
            prisma.user.delete({ where: { id: userId } })
        ]);

        // Clear the now-orphaned session cookies.
        res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' });
        res.clearCookie('csrf-token', { httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' });
        res.json({ message: "Your account and all associated data have been permanently deleted." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete account." });
    }
});

module.exports = router;
