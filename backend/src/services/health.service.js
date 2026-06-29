const prisma = require('../config/prisma');
const { encrypt, decrypt } = require('../../utils/cipher');
const { checkMedication } = require('../../utils/interactions');

// ── Allergies ──────────────────────────────────────────────────────────────

function decryptAllergy(allergy) {
    if (!allergy) return allergy;
    if (allergy.substance) allergy.substance = decrypt(allergy.substance);
    if (allergy.reaction) {
        try {
            allergy.reaction = decrypt(allergy.reaction);
        } catch (e) {
            console.error('Failed to decrypt reaction for allergy', allergy.id);
        }
    }
    return allergy;
}

function decryptAllergies(allergies) {
    allergies.forEach(decryptAllergy);
    return allergies;
}

async function getDecryptedAllergies(patientId) {
    const allergies = await prisma.allergy.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' }
    });
    return decryptAllergies(allergies);
}

async function createAllergy({ patientId, substance, reaction, severity }) {
    const created = await prisma.allergy.create({
        data: {
            patientId,
            substance: encrypt(substance),
            reaction: reaction ? encrypt(reaction) : null,
            severity
        }
    });
    return decryptAllergy(created);
}

async function updateAllergy({ id, patientId, substance, reaction, severity }) {
    const result = await prisma.allergy.updateMany({
        where: { id, patientId },
        data: {
            substance: encrypt(substance),
            reaction: reaction ? encrypt(reaction) : null,
            severity
        }
    });
    if (result.count === 0) return null;
    const updated = await prisma.allergy.findUnique({ where: { id } });
    return decryptAllergy(updated);
}

async function deleteAllergy({ id, patientId }) {
    const result = await prisma.allergy.deleteMany({ where: { id, patientId } });
    return result.count > 0;
}

// ── Medications ────────────────────────────────────────────────────────────

function decryptMedication(med) {
    if (!med) return med;
    if (med.name) med.name = decrypt(med.name);
    if (med.dosage) {
        try { med.dosage = decrypt(med.dosage); } catch (e) { console.error('Failed to decrypt dosage for medication', med.id); }
    }
    if (med.frequency) {
        try { med.frequency = decrypt(med.frequency); } catch (e) { console.error('Failed to decrypt frequency for medication', med.id); }
    }
    return med;
}

function decryptMedications(medications) {
    medications.forEach(decryptMedication);
    return medications;
}

async function getDecryptedMedications(patientId) {
    const medications = await prisma.medication.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' }
    });
    return decryptMedications(medications);
}

async function createMedication({ patientId, name, dosage, frequency }) {

    const allergies = await getDecryptedAllergies(patientId);
    const medications = await getDecryptedMedications(patientId);

    const created = await prisma.medication.create({
        data: {
            patientId,
            name: encrypt(name),
            dosage: dosage ? encrypt(dosage) : null,
            frequency: frequency ? encrypt(frequency) : null
        }
    });

    const result = decryptMedication(created);
    result.warnings = checkMedication(name, allergies, medications);
    return result;
}

async function updateMedication({ id, patientId, name, dosage, frequency }) {
    const result = await prisma.medication.updateMany({
        where: { id, patientId },
        data: {
            name: encrypt(name),
            dosage: dosage ? encrypt(dosage) : null,
            frequency: frequency ? encrypt(frequency) : null
        }
    });
    if (result.count === 0) return null;
    const updated = await prisma.medication.findUnique({ where: { id } });
    return decryptMedication(updated);
}

async function deleteMedication({ id, patientId }) {
    const result = await prisma.medication.deleteMany({ where: { id, patientId } });
    return result.count > 0;
}

async function setMedicationReminder({ id, patientId, enabled }) {
    const result = await prisma.medication.updateMany({
        where: { id, patientId },
        data: { reminderEnabled: !!enabled }
    });
    if (result.count === 0) return null;
    const updated = await prisma.medication.findUnique({ where: { id } });
    return decryptMedication(updated);
}

// ── Gynecological / obstetric profile ───────────────────────────────────────

async function updatePatientProfile(patientId, fields) {
    const data = {};
    if (fields.sex !== undefined) data.sex = fields.sex;
    if (fields.atMenopause !== undefined) data.atMenopause = fields.atMenopause;
    if (fields.menarcheDate !== undefined) {
        data.menarcheDate = fields.menarcheDate ? new Date(fields.menarcheDate) : null;
    }
    if (fields.menopauseDate !== undefined) {
        data.menopauseDate = fields.menopauseDate ? new Date(fields.menopauseDate) : null;
    }

    if (fields.atMenopause === false) data.menopauseDate = null;

    return prisma.patient.update({
        where: { id: patientId },
        data,
        select: { id: true, sex: true, atMenopause: true, menarcheDate: true, menopauseDate: true }
    });
}

async function getBirths(patientId) {
    return prisma.birth.findMany({
        where: { patientId },
        orderBy: [{ year: 'desc' }, { createdAt: 'desc' }]
    });
}

async function createBirth({ patientId, modality, year }) {
    return prisma.birth.create({
        data: { patientId, modality, year: year ?? null }
    });
}

async function updateBirth({ id, patientId, modality, year }) {
    const result = await prisma.birth.updateMany({
        where: { id, patientId },
        data: { modality, year: year ?? null }
    });
    if (result.count === 0) return null;
    return prisma.birth.findUnique({ where: { id } });
}

async function deleteBirth({ id, patientId }) {
    const result = await prisma.birth.deleteMany({ where: { id, patientId } });
    return result.count > 0;
}

// ── Appointment reminders ────────────────────────────────────────────────────

function decryptAppointment(appt) {
    if (!appt) return appt;
    for (const field of ['specialty', 'location', 'reason']) {
        if (appt[field]) {
            try { appt[field] = decrypt(appt[field]); }
            catch (e) { console.error(`Failed to decrypt ${field} for appointment`, appt.id); }
        }
    }
    return appt;
}

function decryptAppointments(appointments) {
    appointments.forEach(decryptAppointment);
    return appointments;
}

async function getDecryptedAppointments(patientId) {
    const appointments = await prisma.appointment.findMany({
        where: { patientId },
        orderBy: { dateTime: 'asc' }
    });
    return decryptAppointments(appointments);
}

async function createAppointment({ patientId, doctorId, dateTime, specialty, location, reason }) {
    const created = await prisma.appointment.create({
        data: {
            patientId,
            doctorId: doctorId || null,
            dateTime: new Date(dateTime),
            specialty: specialty ? encrypt(specialty) : null,
            location: location ? encrypt(location) : null,
            reason: reason ? encrypt(reason) : null
        }
    });
    return decryptAppointment(created);
}

async function updateAppointment({ id, patientId, dateTime, specialty, location, reason }) {
    const result = await prisma.appointment.updateMany({
        where: { id, patientId },
        data: {
            dateTime: new Date(dateTime),
            specialty: specialty ? encrypt(specialty) : null,
            location: location ? encrypt(location) : null,
            reason: reason ? encrypt(reason) : null
        }
    });
    if (result.count === 0) return null;
    const updated = await prisma.appointment.findUnique({ where: { id } });
    return decryptAppointment(updated);
}

async function deleteAppointment({ id, patientId }) {
    const result = await prisma.appointment.deleteMany({ where: { id, patientId } });
    return result.count > 0;
}

// ── Vaccinations ─────────────────────────────────────────────────────────────

function decryptVaccination(v) {
    if (!v) return v;
    if (v.vaccineName) v.vaccineName = decrypt(v.vaccineName);
    if (v.notes) {
        try { v.notes = decrypt(v.notes); } catch (e) { console.error('Failed to decrypt notes for vaccination', v.id); }
    }
    return v;
}

async function getVaccinations(patientId) {
    const rows = await prisma.vaccination.findMany({
        where: { patientId },
        orderBy: { date: 'desc' }
    });
    rows.forEach(decryptVaccination);
    return rows;
}

async function createVaccination({ patientId, vaccineName, date, doseNumber, nextDoseDate, notes }) {
    const created = await prisma.vaccination.create({
        data: {
            patientId,
            vaccineName: encrypt(vaccineName),
            date: new Date(date),
            doseNumber: doseNumber ?? null,
            nextDoseDate: nextDoseDate ? new Date(nextDoseDate) : null,
            notes: notes ? encrypt(notes) : null
        }
    });
    return decryptVaccination(created);
}

async function deleteVaccination({ id, patientId }) {
    const result = await prisma.vaccination.deleteMany({ where: { id, patientId } });
    return result.count > 0;
}

// ── Vital signs ──────────────────────────────────────────────────────────────

function getVitalSigns(patientId) {
    return prisma.vitalSign.findMany({
        where: { patientId },
        orderBy: { measuredAt: 'asc' }
    });
}

function createVitalSign({ patientId, type, value, value2, unit, measuredAt }) {
    return prisma.vitalSign.create({
        data: {
            patientId,
            type,
            value,
            value2: value2 ?? null,
            unit,
            measuredAt: new Date(measuredAt)
        }
    });
}

async function deleteVitalSign({ id, patientId }) {
    const result = await prisma.vitalSign.deleteMany({ where: { id, patientId } });
    return result.count > 0;
}

module.exports = {
    getVaccinations,
    createVaccination,
    deleteVaccination,
    getVitalSigns,
    createVitalSign,
    deleteVitalSign,
    decryptAllergies,
    getDecryptedAllergies,
    createAllergy,
    updateAllergy,
    deleteAllergy,
    decryptMedications,
    getDecryptedMedications,
    createMedication,
    updateMedication,
    deleteMedication,
    setMedicationReminder,
    updatePatientProfile,
    getBirths,
    createBirth,
    updateBirth,
    deleteBirth,
    decryptAppointments,
    getDecryptedAppointments,
    createAppointment,
    updateAppointment,
    deleteAppointment
};
