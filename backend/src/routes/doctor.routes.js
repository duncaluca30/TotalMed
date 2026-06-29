const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const prisma = require('../config/prisma');
const authenticateToken = require('../middleware/authenticate');
const { vaultLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { recordSchema, patientSearchSchema, emergencyAccessSchema } = require('../schemas/doctor.schema');
const { vaultAccessSchema } = require('../schemas/vault.schema');
const { doctorAllergySchema, doctorMedicationSchema, doctorBirthSchema, doctorPatientProfileSchema, doctorAppointmentSchema, doctorVitalSchema, doctorVaccinationSchema } = require('../schemas/health.schema');

const { lookupAccessCode, decryptRecords, createEncryptedRecord, createAuditLog, getDecryptedRecords } = require('../services/vault.service');
const health = require('../services/health.service');
const attachments = require('../services/attachment.service');
const amendments = require('../services/amendment.service');
const notifications = require('../services/notification.service');
const { singleFile } = require('../middleware/upload');
const { isVaultTokenRevoked, setActiveVaultDoctor, clearActiveVaultDoctor } = require('../services/vaultRevocations');
const { sendEmergencyAccessEmail } = require('../../utils/mailer');
const { decrypt } = require('../../utils/cipher');

function verifyVaultSession(vaultToken, doctorId, patientId) {
    let session;
    try {
        session = jwt.verify(vaultToken, process.env.JWT_SECRET);
    } catch (err) {
        return { ok: false, status: 403, error: "Vault session expired. Please re-enter a new access code." };
    }
    if (session.patientId !== patientId || session.doctorId !== doctorId) {
        return { ok: false, status: 403, error: "Vault session mismatch. Access denied." };
    }
    if (isVaultTokenRevoked(session.patientId, session.iat)) {
        return { ok: false, status: 403, error: "Access was revoked by the patient." };
    }
    return { ok: true, session };
}

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

            try {
                if (authData.approved) {

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

                const sharedRecordIds = Array.isArray(authData.sharedRecordIds) ? authData.sharedRecordIds : [];
                const approvedRecords = patientData.medicalRecords.filter(record =>
                    sharedRecordIds.includes(record.id)
                );

                const totalRecords = approvedRecords.length;
                const paginatedRecords = approvedRecords.slice(skip, skip + limit);
                decryptRecords(paginatedRecords);
                await attachments.attachMetaToRecords(paginatedRecords);
                await amendments.attachToRecords(paginatedRecords);
                patientData.medicalRecords = paginatedRecords;

                patientData.allergies = await health.getDecryptedAllergies(validCode.patientId);
                patientData.medications = await health.getDecryptedMedications(validCode.patientId);
                patientData.births = await health.getBirths(validCode.patientId);
                patientData.appointments = await health.getDecryptedAppointments(validCode.patientId);
                patientData.vitalSigns = await health.getVitalSigns(validCode.patientId);
                patientData.vaccinations = await health.getVaccinations(validCode.patientId);

                const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
                await createAuditLog({
                    userId: doctor.userId,
                    action: 'VAULT_ACCESSED',
                    details: { patientId: validCode.patientId, approvedRecords: sharedRecordIds.length },
                    ipAddress: rawIp
                });

                const ALLOWED_DURATIONS = [15, 60, 480, 1440];
                const durationMinutes = ALLOWED_DURATIONS.includes(authData.durationMinutes)
                    ? authData.durationMinutes
                    : 15;

                const vaultToken = jwt.sign(
                    { patientId: validCode.patientId, doctorId: doctor.id },
                    process.env.JWT_SECRET,
                    { expiresIn: `${durationMinutes}m` }
                );

                setActiveVaultDoctor(validCode.patientId, doctor.userId);

                req.io.to(patientUser.userId).emit('vault-viewing-started', {
                    doctorName: `Dr. ${doctor.lastName}`,
                    durationMinutes
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

router.post('/records', authenticateToken, validate(recordSchema), async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });

        const { patientId, vaultToken, diagnosis, treatment, notes, icdCode } = req.body;

        let vaultSession;
        try {
            vaultSession = jwt.verify(vaultToken, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(403).json({ error: "Vault session expired. Please re-enter a new access code." });
        }

        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
        if (vaultSession.patientId !== patientId || vaultSession.doctorId !== doctor.id) {
            return res.status(403).json({ error: "Vault session mismatch. Access denied." });
        }

        if (isVaultTokenRevoked(vaultSession.patientId, vaultSession.iat)) {
            return res.status(403).json({ error: "Access was revoked by the patient." });
        }

        const newRecord = await createEncryptedRecord({
            diagnosis, treatment, notes, icdCode,
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

                const decryptedRecord = {
                    ...newRecord,
                    diagnosis,
                    treatment,
                    notes: notes || null,
                    icdCode: icdCode || null,
                    doctor: { lastName: doctor.lastName }
                };
                io.to(patientForSocket.userId).emit('vault-updated', { newRecord: decryptedRecord });

                const note = await notifications.create(
                    patientForSocket.userId,
                    'RECORD_ADDED',
                    'New medical record added',
                    `Dr. ${doctor.lastName} added "${diagnosis}" to your file.`
                );
                if (note) io.to(patientForSocket.userId).emit('notification', note);
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

// ── Attachments (doctor, during an active vault session) ─────────────────────

router.post('/attachments', authenticateToken, singleFile('file'), async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const { patientId, vaultToken, recordId } = req.body;
        const check = verifyVaultSession(vaultToken, doctor.id, patientId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

        if (!req.file) return res.status(400).json({ error: "No file uploaded." });
        if (!recordId) return res.status(400).json({ error: "recordId is required." });
        if (!(await attachments.recordBelongsToPatient(recordId, patientId))) {
            return res.status(404).json({ error: "Record not found for this patient." });
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
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const owningPatientId = await attachments.getOwningPatientId(req.params.id);
        if (!owningPatientId) return res.status(404).json({ error: "Attachment not found." });

        const check = verifyVaultSession(req.query.vaultToken, doctor.id, owningPatientId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

        const file = await attachments.getDataForPatient(req.params.id, owningPatientId);
        if (!file) return res.status(404).json({ error: "Attachment not found." });

        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
        res.send(file.buffer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to download attachment." });
    }
});

// ── Record amendments (doctor, during an active vault session) ───────────────

router.post('/records/:id/amendments', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const { patientId, vaultToken, text } = req.body;
        const check = verifyVaultSession(vaultToken, doctor.id, patientId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

        if (!text || !text.trim()) return res.status(400).json({ error: "Amendment text is required." });
        if (!(await amendments.recordBelongsToPatient(req.params.id, patientId))) {
            return res.status(404).json({ error: "Record not found for this patient." });
        }

        const amendment = await amendments.createAmendment({ recordId: req.params.id, doctorId: doctor.id, text: text.trim() });

        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        await createAuditLog({ userId: req.user.id, action: 'AMENDMENT_ADDED', details: { patientId, recordId: req.params.id, amendmentId: amendment.id }, ipAddress: rawIp });

        res.status(201).json(amendment);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add amendment." });
    }
});

// ── Allergies (doctor, during an active vault session) ───────────────────────

router.post('/allergies', authenticateToken, validate(doctorAllergySchema), async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const { patientId, vaultToken, substance, reaction, severity } = req.body;
        const check = verifyVaultSession(vaultToken, doctor.id, patientId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

        const allergy = await health.createAllergy({ patientId, substance, reaction, severity });

        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        await createAuditLog({ userId: req.user.id, action: 'ALLERGY_ADDED', details: { patientId, allergyId: allergy.id }, ipAddress: rawIp });

        res.status(201).json(allergy);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add allergy." });
    }
});

router.put('/allergies/:id', authenticateToken, validate(doctorAllergySchema), async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const { patientId, vaultToken, substance, reaction, severity } = req.body;
        const check = verifyVaultSession(vaultToken, doctor.id, patientId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

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
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const { patientId, vaultToken } = req.body;
        const check = verifyVaultSession(vaultToken, doctor.id, patientId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

        const deleted = await health.deleteAllergy({ id: req.params.id, patientId });
        if (!deleted) return res.status(404).json({ error: "Allergy not found." });
        res.json({ message: "Allergy removed." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to remove allergy." });
    }
});

// ── Medications (doctor, during an active vault session) ──────────────────────

router.post('/medications', authenticateToken, validate(doctorMedicationSchema), async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const { patientId, vaultToken, name, dosage, frequency } = req.body;
        const check = verifyVaultSession(vaultToken, doctor.id, patientId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

        const medication = await health.createMedication({ patientId, name, dosage, frequency });

        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        await createAuditLog({ userId: req.user.id, action: 'MEDICATION_ADDED', details: { patientId, medicationId: medication.id }, ipAddress: rawIp });

        res.status(201).json(medication);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add medication." });
    }
});

router.put('/medications/:id', authenticateToken, validate(doctorMedicationSchema), async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const { patientId, vaultToken, name, dosage, frequency } = req.body;
        const check = verifyVaultSession(vaultToken, doctor.id, patientId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

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
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const { patientId, vaultToken } = req.body;
        const check = verifyVaultSession(vaultToken, doctor.id, patientId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

        const deleted = await health.deleteMedication({ id: req.params.id, patientId });
        if (!deleted) return res.status(404).json({ error: "Medication not found." });
        res.json({ message: "Medication removed." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to remove medication." });
    }
});

// ── Gynecological profile (doctor, during an active vault session) ───────────

router.put('/patient-profile', authenticateToken, validate(doctorPatientProfileSchema), async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const { patientId, vaultToken, sex, atMenopause, menarcheDate, menopauseDate } = req.body;
        const check = verifyVaultSession(vaultToken, doctor.id, patientId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

        const updated = await health.updatePatientProfile(patientId, { sex, atMenopause, menarcheDate, menopauseDate });
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update profile." });
    }
});

router.post('/births', authenticateToken, validate(doctorBirthSchema), async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const { patientId, vaultToken, modality, year } = req.body;
        const check = verifyVaultSession(vaultToken, doctor.id, patientId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

        const birth = await health.createBirth({ patientId, modality, year });
        res.status(201).json(birth);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add birth." });
    }
});

router.put('/births/:id', authenticateToken, validate(doctorBirthSchema), async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const { patientId, vaultToken, modality, year } = req.body;
        const check = verifyVaultSession(vaultToken, doctor.id, patientId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

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
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const { patientId, vaultToken } = req.body;
        const check = verifyVaultSession(vaultToken, doctor.id, patientId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

        const deleted = await health.deleteBirth({ id: req.params.id, patientId });
        if (!deleted) return res.status(404).json({ error: "Birth not found." });
        res.json({ message: "Birth removed." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to remove birth." });
    }
});

// ── Vital signs (doctor, during an active vault session) ─────────────────────

router.post('/vitals', authenticateToken, validate(doctorVitalSchema), async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const { patientId, vaultToken, type, value, value2, unit, measuredAt } = req.body;
        const check = verifyVaultSession(vaultToken, doctor.id, patientId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

        const vital = await health.createVitalSign({ patientId, type, value, value2, unit, measuredAt });
        res.status(201).json(vital);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add vital sign." });
    }
});

// ── Vaccinations (doctor, during an active vault session) ────────────────────

router.post('/vaccinations', authenticateToken, validate(doctorVaccinationSchema), async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const { patientId, vaultToken, vaccineName, date, doseNumber, nextDoseDate, notes } = req.body;
        const check = verifyVaultSession(vaultToken, doctor.id, patientId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

        const vaccination = await health.createVaccination({ patientId, vaccineName, date, doseNumber, nextDoseDate, notes });
        res.status(201).json(vaccination);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add vaccination." });
    }
});

// ── Appointment reminders (doctor, during an active vault session) ───────────

router.post('/appointments', authenticateToken, validate(doctorAppointmentSchema), async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const { patientId, vaultToken, dateTime, specialty, location, reason } = req.body;
        const check = verifyVaultSession(vaultToken, doctor.id, patientId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

        const appointment = await health.createAppointment({ patientId, doctorId: doctor.id, dateTime, specialty, location, reason });
        res.status(201).json(appointment);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add appointment." });
    }
});

router.put('/appointments/:id', authenticateToken, validate(doctorAppointmentSchema), async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const { patientId, vaultToken, dateTime, specialty, location, reason } = req.body;
        const check = verifyVaultSession(vaultToken, doctor.id, patientId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

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
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const { patientId, vaultToken } = req.body;
        const check = verifyVaultSession(vaultToken, doctor.id, patientId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

        const deleted = await health.deleteAppointment({ id: req.params.id, patientId });
        if (!deleted) return res.status(404).json({ error: "Appointment not found." });
        res.json({ message: "Appointment removed." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to remove appointment." });
    }
});

router.get('/consultations', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
        if (!doctor) return res.status(404).json({ error: "Doctor profile not found." });

        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const skip = (page - 1) * limit;

        const [rows, total] = await Promise.all([
            prisma.medicalRecord.findMany({
                where: { doctorId: doctor.id },
                include: { patient: { select: { firstName: true, lastName: true } } },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.medicalRecord.count({ where: { doctorId: doctor.id } })
        ]);

        const consultations = rows.map(r => ({
            id: r.id,
            diagnosis: decrypt(r.diagnosis),
            icdCode: r.icdCode ? decrypt(r.icdCode) : null,
            patient: `${r.patient.firstName} ${r.patient.lastName}`,
            createdAt: r.createdAt
        }));

        res.json({ consultations, pagination: { page, limit, total, hasMore: skip + limit < total } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load consultations." });
    }
});

router.get('/patient-search', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });

        const { cnp } = req.query;
        const parsed = patientSearchSchema.safeParse({ cnp });
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid CNP." });
        }
        const patient = await prisma.patient.findUnique({
            where: { cnp },
            select: { id: true, firstName: true, lastName: true, dateOfBirth: true }
        });

        if (!patient) return res.status(404).json({ error: "No patient found with that CNP." });

        res.json({ patient });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Patient search failed." });
    }
});

router.post('/emergency-access', authenticateToken, vaultLimiter, validate(emergencyAccessSchema), async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });

        const { patientId, reason } = req.body;
        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
        if (!doctor) return res.status(404).json({ error: "Doctor profile not found." });

        const patientWithUser = await prisma.patient.findUnique({
            where: { id: patientId },
            include: { user: { select: { email: true } } }
        });
        if (!patientWithUser) return res.status(404).json({ error: "Patient not found." });

        const emergencyLog = await prisma.emergencyAccess.create({
            data: { doctorId: doctor.id, patientId, reason }
        });
        await createAuditLog({
            userId: req.user.id,
            action: 'EMERGENCY_ACCESS',
            details: { patientId, emergencyLogId: emergencyLog.id, reason },
            ipAddress: rawIp
        });

        const { records } = await getDecryptedRecords(patientId, 1, 1000);
        const allergies = await health.getDecryptedAllergies(patientId);
        const medications = await health.getDecryptedMedications(patientId);
        const births = await health.getBirths(patientId);
        const vitalSigns = await health.getVitalSigns(patientId);
        const vaccinations = await health.getVaccinations(patientId);

        const vaultToken = jwt.sign(
            { patientId, doctorId: doctor.id },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        setActiveVaultDoctor(patientId, doctor.userId);

        req.io.to(patientWithUser.userId).emit('vault-viewing-started', {
            doctorName: `Dr. ${doctor.lastName}`,
            durationMinutes: 15
        });

        const timestamp = new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' });
        sendEmergencyAccessEmail(
            patientWithUser.user.email,
            `Dr. ${doctor.firstName} ${doctor.lastName}`,
            doctor.specialty,
            reason,
            timestamp
        ).then(() => prisma.emergencyAccess.update({
            where: { id: emergencyLog.id },
            data: { notifiedAt: new Date() }
        })).catch(() => {});

        const note = await notifications.create(
            patientWithUser.userId,
            'EMERGENCY_ACCESS',
            'Emergency access to your records',
            `Dr. ${doctor.firstName} ${doctor.lastName} (${doctor.specialty}) accessed your records under an emergency override. Reason: ${reason}`
        );
        if (note) req.io.to(patientWithUser.userId).emit('notification', note);

        res.json({
            patient: { ...patientWithUser, medicalRecords: records, allergies, medications, births, vitalSigns, vaccinations },
            vaultToken
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Emergency access failed." });
    }
});

router.post('/lock-vault', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });

        const { vaultToken } = req.body;
        let session;
        try {
            session = jwt.verify(vaultToken, process.env.JWT_SECRET);
        } catch (err) {

            return res.json({ ok: true });
        }

        clearActiveVaultDoctor(session.patientId);

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
