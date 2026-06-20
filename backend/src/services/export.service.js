const prisma = require('../config/prisma');
const { getDecryptedRecords } = require('./vault.service');
const health = require('./health.service');

/**
 * Assemble a patient's full medical history as a minimal FHIR R4-style Bundle
 * (the GDPR right to data portability). All sensitive fields are decrypted. This
 * is intentionally a lightweight mapping — enough to be recognisably FHIR and
 * machine-readable, not a certified implementation.
 */
async function buildFhirBundle(patientId) {
    const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        include: { user: { select: { email: true } } }
    });
    if (!patient) return null;

    const { records } = await getDecryptedRecords(patientId, 1, 10000);
    const allergies = await health.getDecryptedAllergies(patientId);
    const medications = await health.getDecryptedMedications(patientId);
    const appointments = await health.getDecryptedAppointments(patientId);
    const births = await health.getBirths(patientId);
    const vitals = await health.getVitalSigns(patientId);

    const entries = [];

    entries.push({
        resource: {
            resourceType: 'Patient',
            id: patient.id,
            name: [{ family: patient.lastName, given: [patient.firstName] }],
            gender: (patient.sex || '').toLowerCase() || 'unknown',
            birthDate: patient.dateOfBirth ? patient.dateOfBirth.toISOString().slice(0, 10) : undefined,
            telecom: [
                patient.phone ? { system: 'phone', value: patient.phone } : null,
                patient.user?.email ? { system: 'email', value: patient.user.email } : null
            ].filter(Boolean)
        }
    });

    for (const r of records) {
        entries.push({
            resource: {
                resourceType: 'Condition',
                id: r.id,
                subject: { reference: `Patient/${patient.id}` },
                code: { text: r.diagnosis },
                note: [r.treatment ? { text: `Treatment: ${r.treatment}` } : null,
                       r.notes ? { text: r.notes } : null].filter(Boolean),
                recordedDate: r.createdAt
            }
        });
    }

    for (const a of allergies) {
        entries.push({
            resource: {
                resourceType: 'AllergyIntolerance',
                id: a.id,
                patient: { reference: `Patient/${patient.id}` },
                code: { text: a.substance },
                reaction: a.reaction ? [{ description: a.reaction }] : undefined,
                criticality: a.severity === 'SEVERE' ? 'high' : a.severity === 'MODERATE' ? 'low' : 'low'
            }
        });
    }

    for (const m of medications) {
        entries.push({
            resource: {
                resourceType: 'MedicationStatement',
                id: m.id,
                subject: { reference: `Patient/${patient.id}` },
                medicationCodeableConcept: { text: m.name },
                dosage: (m.dosage || m.frequency)
                    ? [{ text: [m.dosage, m.frequency].filter(Boolean).join(' · ') }]
                    : undefined
            }
        });
    }

    for (const ap of appointments) {
        entries.push({
            resource: {
                resourceType: 'Appointment',
                id: ap.id,
                status: (ap.status || 'booked').toLowerCase(),
                start: ap.dateTime,
                description: [ap.specialty, ap.reason].filter(Boolean).join(' — ') || undefined,
                comment: ap.location || undefined
            }
        });
    }

    for (const b of births) {
        entries.push({
            resource: {
                resourceType: 'Observation',
                id: b.id,
                status: 'final',
                subject: { reference: `Patient/${patient.id}` },
                code: { text: 'Birth' },
                valueString: `${b.modality}${b.year ? ` (${b.year})` : ''}`
            }
        });
    }

    for (const v of vitals) {
        entries.push({
            resource: {
                resourceType: 'Observation',
                id: v.id,
                status: 'final',
                subject: { reference: `Patient/${patient.id}` },
                code: { text: v.type },
                effectiveDateTime: v.measuredAt,
                valueString: `${v.value2 != null ? `${v.value}/${v.value2}` : v.value} ${v.unit}`
            }
        });
    }

    return {
        resourceType: 'Bundle',
        type: 'collection',
        meta: { source: 'TotalMed', generated: new Date().toISOString() },
        entry: entries
    };
}

module.exports = { buildFhirBundle };
