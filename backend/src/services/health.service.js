const prisma = require('../config/prisma');
const { encrypt, decrypt } = require('../../utils/cipher');

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

/** Decrypt a list of allergies in place. */
function decryptAllergies(allergies) {
    allergies.forEach(decryptAllergy);
    return allergies;
}

/** Fetch and decrypt all allergies for a patient. */
async function getDecryptedAllergies(patientId) {
    const allergies = await prisma.allergy.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' }
    });
    return decryptAllergies(allergies);
}

/** Create an encrypted allergy, returning it decrypted. */
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

/**
 * Update an allergy, scoped to its owning patient so no one can edit another
 * patient's data. Returns the decrypted record, or null if not found/owned.
 */
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

/** Delete an allergy scoped to its owning patient. Returns true if deleted. */
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

/** Decrypt a list of medications in place. */
function decryptMedications(medications) {
    medications.forEach(decryptMedication);
    return medications;
}

/** Fetch and decrypt all current medications for a patient. */
async function getDecryptedMedications(patientId) {
    const medications = await prisma.medication.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' }
    });
    return decryptMedications(medications);
}

/** Create an encrypted medication, returning it decrypted. */
async function createMedication({ patientId, name, dosage, frequency }) {
    const created = await prisma.medication.create({
        data: {
            patientId,
            name: encrypt(name),
            dosage: dosage ? encrypt(dosage) : null,
            frequency: frequency ? encrypt(frequency) : null
        }
    });
    return decryptMedication(created);
}

/** Update a medication scoped to its owning patient. Returns decrypted record or null. */
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

/** Delete a medication scoped to its owning patient. Returns true if deleted. */
async function deleteMedication({ id, patientId }) {
    const result = await prisma.medication.deleteMany({ where: { id, patientId } });
    return result.count > 0;
}

// ── Gynecological / obstetric profile ───────────────────────────────────────

/**
 * Patch the patient-level gynecological fields (sex, menopause, menarche).
 * Only the keys present in `fields` are touched, so partial updates are safe.
 * Returns the updated subset.
 */
async function updatePatientProfile(patientId, fields) {
    const data = {};
    if (fields.sex !== undefined) data.sex = fields.sex;
    if (fields.atMenopause !== undefined) data.atMenopause = fields.atMenopause;
    if (fields.menarcheDate !== undefined) {
        data.menarcheDate = fields.menarcheDate ? new Date(fields.menarcheDate) : null;
    }

    return prisma.patient.update({
        where: { id: patientId },
        data,
        select: { id: true, sex: true, atMenopause: true, menarcheDate: true }
    });
}

/** Fetch all births for a patient (most recent first). */
async function getBirths(patientId) {
    return prisma.birth.findMany({
        where: { patientId },
        orderBy: [{ year: 'desc' }, { createdAt: 'desc' }]
    });
}

/** Create a birth entry. */
async function createBirth({ patientId, modality, year }) {
    return prisma.birth.create({
        data: { patientId, modality, year: year ?? null }
    });
}

/** Update a birth scoped to its owning patient. Returns the record or null. */
async function updateBirth({ id, patientId, modality, year }) {
    const result = await prisma.birth.updateMany({
        where: { id, patientId },
        data: { modality, year: year ?? null }
    });
    if (result.count === 0) return null;
    return prisma.birth.findUnique({ where: { id } });
}

/** Delete a birth scoped to its owning patient. Returns true if deleted. */
async function deleteBirth({ id, patientId }) {
    const result = await prisma.birth.deleteMany({ where: { id, patientId } });
    return result.count > 0;
}

module.exports = {
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
    updatePatientProfile,
    getBirths,
    createBirth,
    updateBirth,
    deleteBirth
};
