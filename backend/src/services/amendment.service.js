const prisma = require('../config/prisma');
const { encrypt, decrypt } = require('../../utils/cipher');

function toView(am) {
    return {
        id: am.id,
        recordId: am.recordId,
        text: decrypt(am.text),
        doctor: am.doctor ? `Dr. ${am.doctor.firstName} ${am.doctor.lastName}` : null,
        createdAt: am.createdAt
    };
}

async function createAmendment({ recordId, doctorId, text }) {
    const created = await prisma.amendment.create({
        data: { recordId, doctorId, text: encrypt(text) },
        include: { doctor: { select: { firstName: true, lastName: true } } }
    });
    return toView(created);
}

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

async function recordBelongsToPatient(recordId, patientId) {
    const rec = await prisma.medicalRecord.findUnique({
        where: { id: recordId },
        select: { patientId: true }
    });
    return !!rec && rec.patientId === patientId;
}

module.exports = { createAmendment, attachToRecords, recordBelongsToPatient };
