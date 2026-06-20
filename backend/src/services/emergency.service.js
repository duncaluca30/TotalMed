const crypto = require('crypto');
const prisma = require('../config/prisma');
const { encrypt, decrypt } = require('../../utils/cipher');
const { getDecryptedAllergies, getDecryptedMedications } = require('./health.service');

// The patient-facing Emergency Medical ID profile (decrypted, for the owner).
async function getProfile(patientId) {
    const p = await prisma.patient.findUnique({
        where: { id: patientId },
        select: {
            firstName: true, lastName: true,
            bloodType: true, emergencyContactName: true, emergencyContactPhone: true,
            emergencyId: true, emergencyEnabled: true
        }
    });
    if (!p) return null;
    return {
        firstName: p.firstName,
        lastName: p.lastName,
        bloodType: p.bloodType ? decrypt(p.bloodType) : null,
        emergencyContactName: p.emergencyContactName ? decrypt(p.emergencyContactName) : null,
        emergencyContactPhone: p.emergencyContactPhone ? decrypt(p.emergencyContactPhone) : null,
        emergencyId: p.emergencyId,
        emergencyEnabled: p.emergencyEnabled
    };
}

// Update the editable fields. Enabling for the first time mints a token; the
// patient can also force a fresh token (revoking the old URL) via regenerate.
async function updateProfile(patientId, { bloodType, emergencyContactName, emergencyContactPhone, enabled, regenerate }) {
    const current = await prisma.patient.findUnique({ where: { id: patientId }, select: { emergencyId: true } });

    const data = {
        bloodType: bloodType ? encrypt(bloodType) : null,
        emergencyContactName: emergencyContactName ? encrypt(emergencyContactName) : null,
        emergencyContactPhone: emergencyContactPhone ? encrypt(emergencyContactPhone) : null
    };
    if (enabled !== undefined) data.emergencyEnabled = !!enabled;

    // Mint a token when enabling and none exists, or when explicitly regenerating.
    if (regenerate || (enabled && !current?.emergencyId)) {
        data.emergencyId = crypto.randomBytes(24).toString('base64url');
    }

    await prisma.patient.update({ where: { id: patientId }, data });
    return getProfile(patientId);
}

// The PUBLIC card served to a first responder via the token. No auth. Returns
// only the minimal safety set, and only if the patient has it enabled.
async function getPublicCard(token) {
    if (!token) return null;
    const p = await prisma.patient.findUnique({
        where: { emergencyId: token },
        select: {
            id: true, firstName: true, lastName: true, dateOfBirth: true, sex: true,
            bloodType: true, emergencyContactName: true, emergencyContactPhone: true,
            emergencyEnabled: true
        }
    });
    if (!p || !p.emergencyEnabled) return null;

    const allergies = await getDecryptedAllergies(p.id);
    const medications = await getDecryptedMedications(p.id);

    return {
        firstName: p.firstName,
        lastName: p.lastName,
        dateOfBirth: p.dateOfBirth,
        sex: p.sex,
        bloodType: p.bloodType ? decrypt(p.bloodType) : null,
        emergencyContactName: p.emergencyContactName ? decrypt(p.emergencyContactName) : null,
        emergencyContactPhone: p.emergencyContactPhone ? decrypt(p.emergencyContactPhone) : null,
        allergies: allergies.map(a => ({ substance: a.substance, reaction: a.reaction, severity: a.severity })),
        medications: medications.map(m => ({ name: m.name, dosage: m.dosage, frequency: m.frequency }))
    };
}

module.exports = { getProfile, updateProfile, getPublicCard };
