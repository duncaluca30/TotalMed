const prisma = require('../config/prisma');
const { encrypt, decrypt } = require('../../utils/cipher');

// Public, decrypted view of an amendment row.
function toView(am) {
    return {
        id: am.id,
        recordId: am.recordId,
        text: decrypt(am.text),
        doctor: am.doctor ? `Dr. ${am.doctor.firstName} ${am.doctor.lastName}` : null,
        createdAt: am.createdAt
    };
}

/** Create an encrypted amendment on a record. Returns the decrypted view. */
async function createAmendment({ recordId, doctorId, text }) {
    const created = await prisma.amendment.create({
        data: { recordId, doctorId, text: encrypt(text) },
        include: { doctor: { select: { firstName: true, lastName: true } } }
    });
    return toView(created);
}

/**
 * Attach decrypted amendments to each record under a `.amendments` key, in one
 * query. Mirrors attachment.service.attachMetaToRecords.
 */
async function attachToRecords(records) {
    if (!records || records.length === 0) return records;
    const ids = records.map(r => r.id);
    const rows = await prisma.amendment.findMany({
        where: { recordId: { in: ids } },
        include: { doctor: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'asc' }
    });
    const byRecord = new Map();
    for (const row of rows) {
        const list = byRecord.get(row.recordId) || [];
        list.push(toView(row));
        byRecord.set(row.recordId, list);
    }
    records.forEach(r => { r.amendments = byRecord.get(r.id) || []; });
    return records;
}

/** Confirm a record belongs to a patient (used before accepting an amendment). */
async function recordBelongsToPatient(recordId, patientId) {
    const rec = await prisma.medicalRecord.findUnique({
        where: { id: recordId },
        select: { patientId: true }
    });
    return !!rec && rec.patientId === patientId;
}

module.exports = { createAmendment, attachToRecords, recordBelongsToPatient };
