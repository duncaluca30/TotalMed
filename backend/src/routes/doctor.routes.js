const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const prisma = require('../config/prisma');
const authenticateToken = require('../middleware/authenticate');
const { vaultLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { recordSchema } = require('../schemas/doctor.schema');
const { vaultAccessSchema } = require('../schemas/vault.schema');
const { doctorAllergySchema, doctorMedicationSchema, doctorBirthSchema, doctorPatientProfileSchema, doctorAppointmentSchema } = require('../schemas/health.schema');

const { lookupAccessCode, decryptRecords, createEncryptedRecord, createAuditLog } = require('../services/vault.service');
const health = require('../services/health.service');
const { isVaultTokenRevoked } = require('../services/vaultRevocations');

/**
 * Validate an active vault session for the requesting doctor against a target
 * patient. Returns { ok: true } on success, or { ok: false, status, error }
 * describing why access is denied. Mirrors the checks in POST /records.
 */
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

                // Allergies and current medications are safety-critical, so they
                // are always shared with the treating doctor — regardless of which
                // historical records the patient chose to disclose.
                patientData.allergies = await health.getDecryptedAllergies(validCode.patientId);
                patientData.medications = await health.getDecryptedMedications(validCode.patientId);
                patientData.births = await health.getBirths(validCode.patientId);
                patientData.appointments = await health.getDecryptedAppointments(validCode.patientId);

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

        // Reject if the patient revoked this session after the token was issued.
        if (isVaultTokenRevoked(vaultSession.patientId, vaultSession.iat)) {
            return res.status(403).json({ error: "Access was revoked by the patient." });
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

// ── Allergies (doctor, during an active vault session) ───────────────────────

// POST /api/doctor/allergies
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

// PUT /api/doctor/allergies/:id
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

// DELETE /api/doctor/allergies/:id
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

// POST /api/doctor/medications
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

// PUT /api/doctor/medications/:id
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

// DELETE /api/doctor/medications/:id
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

// PUT /api/doctor/patient-profile
router.put('/patient-profile', authenticateToken, validate(doctorPatientProfileSchema), async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const { patientId, vaultToken, sex, atMenopause, menarcheDate } = req.body;
        const check = verifyVaultSession(vaultToken, doctor.id, patientId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

        const updated = await health.updatePatientProfile(patientId, { sex, atMenopause, menarcheDate });
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update profile." });
    }
});

// POST /api/doctor/births
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

// PUT /api/doctor/births/:id
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

// DELETE /api/doctor/births/:id
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

// ── Appointment reminders (doctor, during an active vault session) ───────────

// POST /api/doctor/appointments
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

// PUT /api/doctor/appointments/:id
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

// DELETE /api/doctor/appointments/:id
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
