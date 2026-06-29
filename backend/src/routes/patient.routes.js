const express = require('express');
const router = express.Router();

const prisma = require('../config/prisma');
const authenticateToken = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { getDecryptedRecords, generateAccessCode, getPatientAccessLog, buildAccessQrPayload } = require('../services/vault.service');
const { revokeVaultAccess, getActiveVaultDoctor, clearActiveVaultDoctor } = require('../services/vaultRevocations');
const { allergySchema, medicationSchema, birthSchema, patientProfileSchema, appointmentSchema, vitalSchema, vaccinationSchema, emergencyProfileSchema } = require('../schemas/health.schema');
const health = require('../services/health.service');
const emergency = require('../services/emergency.service');
const attachments = require('../services/attachment.service');
const { buildFhirBundle } = require('../services/export.service');
const { createAuditLog } = require('../services/vault.service');
const qrcode = require('qrcode');
const { singleFile } = require('../middleware/upload');
const { decrypt } = require('../../utils/cipher');

async function getPatientId(userId) {
    const patient = await prisma.patient.findUnique({
        where: { userId },
        select: { id: true }
    });
    return patient ? patient.id : null;
}

async function withEmergencyLink(req, profile) {
    if (!profile || !profile.emergencyEnabled || !profile.emergencyId) return profile;
    const base = req.headers.origin || process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
    const emergencyUrl = `${base}/emergency/${profile.emergencyId}`;
    const qrDataUrl = await qrcode.toDataURL(emergencyUrl);
    return { ...profile, emergencyUrl, qrDataUrl };
}

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

        const { records, total } = await getDecryptedRecords(patientData.id, page, limit);
        patientData.medicalRecords = records;

        patientData.allergies = await health.getDecryptedAllergies(patientData.id);
        patientData.medications = await health.getDecryptedMedications(patientData.id);
        patientData.births = await health.getBirths(patientData.id);
        patientData.appointments = await health.getDecryptedAppointments(patientData.id);
        patientData.vitalSigns = await health.getVitalSigns(patientData.id);
        patientData.vaccinations = await health.getVaccinations(patientData.id);

        if (patientData.accessCode) {
            patientData.accessCode.code = decrypt(patientData.accessCode.code);
            const base = req.headers.origin || process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
            patientData.accessCode.qrDataUrl = await qrcode.toDataURL(buildAccessQrPayload(patientData.accessCode.code, base));
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

router.post('/generate-code', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });

        const patient = await prisma.patient.findUnique({ where: { userId: req.user.id } });
        if (!patient) return res.status(404).json({ error: "Patient profile not found." });

        const base = req.headers.origin || process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
        const result = await generateAccessCode(patient.id, base);
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to generate access code" });
    }
});

router.post('/revoke-access', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });

        const patient = await prisma.patient.findUnique({
            where: { userId: req.user.id },
            select: { id: true }
        });
        if (!patient) return res.status(404).json({ error: "Patient profile not found." });

        revokeVaultAccess(patient.id);

        const doctorUserId = getActiveVaultDoctor(patient.id);
        if (doctorUserId) {
            req.io.to(doctorUserId.toString()).emit('vault-access-revoked');
            clearActiveVaultDoctor(patient.id);
        }

        res.json({ message: "Access revoked." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to revoke access." });
    }
});

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

router.post('/medications/:id/reminder', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const medication = await health.setMedicationReminder({ id: req.params.id, patientId, enabled: req.body.enabled });
        if (!medication) return res.status(404).json({ error: "Medication not found." });
        res.json(medication);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update reminder." });
    }
});

// ── Gynecological profile (patient self-service) ─────────────────────────────

router.put('/profile', authenticateToken, validate(patientProfileSchema), async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const { sex, atMenopause, menarcheDate, menopauseDate } = req.body;
        const updated = await health.updatePatientProfile(patientId, { sex, atMenopause, menarcheDate, menopauseDate });
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update profile." });
    }
});

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

// ── Vital signs (patient self-service) ───────────────────────────────────────

router.post('/vitals', authenticateToken, validate(vitalSchema), async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const { type, value, value2, unit, measuredAt } = req.body;
        const vital = await health.createVitalSign({ patientId, type, value, value2, unit, measuredAt });
        res.status(201).json(vital);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add vital sign." });
    }
});

router.delete('/vitals/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const deleted = await health.deleteVitalSign({ id: req.params.id, patientId });
        if (!deleted) return res.status(404).json({ error: "Vital sign not found." });
        res.json({ message: "Vital sign removed." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to remove vital sign." });
    }
});

// ── Vaccinations (patient self-service) ──────────────────────────────────────

router.post('/vaccinations', authenticateToken, validate(vaccinationSchema), async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const { vaccineName, date, doseNumber, nextDoseDate, notes } = req.body;
        const vaccination = await health.createVaccination({ patientId, vaccineName, date, doseNumber, nextDoseDate, notes });
        res.status(201).json(vaccination);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add vaccination." });
    }
});

router.delete('/vaccinations/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const deleted = await health.deleteVaccination({ id: req.params.id, patientId });
        if (!deleted) return res.status(404).json({ error: "Vaccination not found." });
        res.json({ message: "Vaccination removed." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to remove vaccination." });
    }
});

// ── Emergency Medical ID (patient self-service) ──────────────────────────────

router.get('/emergency-profile', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const profile = await emergency.getProfile(patientId);
        res.json(await withEmergencyLink(req, profile));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load emergency profile." });
    }
});

router.put('/emergency-profile', authenticateToken, validate(emergencyProfileSchema), async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const patientId = await getPatientId(req.user.id);
        if (!patientId) return res.status(404).json({ error: "Patient profile not found." });

        const profile = await emergency.updateProfile(patientId, req.body);
        res.json(await withEmergencyLink(req, profile));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update emergency profile." });
    }
});

// ── Data portability (GDPR) ──────────────────────────────────────────────────

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

router.delete('/account', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });
        const userId = req.user.id;
        const patient = await prisma.patient.findUnique({ where: { userId }, select: { id: true } });
        if (!patient) return res.status(404).json({ error: "Patient profile not found." });
        const patientId = patient.id;

        const recordIds = (await prisma.medicalRecord.findMany({
            where: { patientId }, select: { id: true }
        })).map(r => r.id);

        await prisma.$transaction([
            prisma.notification.deleteMany({ where: { userId } }),
            prisma.amendment.deleteMany({ where: { recordId: { in: recordIds } } }),
            prisma.attachment.deleteMany({ where: { recordId: { in: recordIds } } }),
            prisma.vitalSign.deleteMany({ where: { patientId } }),
            prisma.vaccination.deleteMany({ where: { patientId } }),
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

        res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' });
        res.clearCookie('csrf-token', { httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' });
        res.json({ message: "Your account and all associated data have been permanently deleted." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete account." });
    }
});

module.exports = router;
