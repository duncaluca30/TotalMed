const prisma = require('../config/prisma');
const { encrypt, decrypt, encryptBuffer, decryptBuffer } = require('../../utils/cipher');

const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp'
]);

const MAX_FILE_BYTES = 2 * 1024 * 1024;

async function createAttachment({ recordId, originalName, mimeType, buffer }) {
    const created = await prisma.attachment.create({
        data: {
            recordId,
            fileName: encrypt(originalName),
            mimeType,
            sizeBytes: buffer.length,
            data: encryptBuffer(buffer)
        }
    });
    return toMeta(created);
}

function toMeta(att) {
    return {
        id: att.id,
        recordId: att.recordId,
        fileName: decrypt(att.fileName),
        mimeType: att.mimeType,
        sizeBytes: att.sizeBytes,
        createdAt: att.createdAt
    };
}

async function listForRecord(recordId) {
    const rows = await prisma.attachment.findMany({
        where: { recordId },
        orderBy: { createdAt: 'asc' }
    });
    return rows.map(toMeta);
}

async function attachMetaToRecords(records) {
    if (!records || records.length === 0) return records;
    const ids = records.map(r => r.id);
    const rows = await prisma.attachment.findMany({
        where: { recordId: { in: ids } },
        orderBy: { createdAt: 'asc' }
    });
    const byRecord = new Map();
    for (const row of rows) {
        const list = byRecord.get(row.recordId) || [];
        list.push(toMeta(row));
        byRecord.set(row.recordId, list);
    }
    records.forEach(r => { r.attachments = byRecord.get(r.id) || []; });
    return records;
}

async function getDataForPatient(attachmentId, patientId) {
    const att = await prisma.attachment.findUnique({
        where: { id: attachmentId },
        include: { record: { select: { patientId: true } } }
    });
    if (!att || att.record.patientId !== patientId) return null;
    return {
        fileName: decrypt(att.fileName),
        mimeType: att.mimeType,
        buffer: decryptBuffer(att.data)
    };
}

async function getOwningPatientId(attachmentId) {
    const att = await prisma.attachment.findUnique({
        where: { id: attachmentId },
        include: { record: { select: { patientId: true } } }
    });
    return att ? att.record.patientId : null;
}

async function deleteForPatient(attachmentId, patientId) {
    const owner = await getOwningPatientId(attachmentId);
    if (owner !== patientId) return false;
    await prisma.attachment.delete({ where: { id: attachmentId } });
    return true;
}

async function recordBelongsToPatient(recordId, patientId) {
    const rec = await prisma.medicalRecord.findUnique({
        where: { id: recordId },
        select: { patientId: true }
    });
    return !!rec && rec.patientId === patientId;
}

module.exports = {
    ALLOWED_MIME_TYPES,
    MAX_FILE_BYTES,
    createAttachment,
    listForRecord,
    attachMetaToRecords,
    getDataForPatient,
    getOwningPatientId,
    deleteForPatient,
    recordBelongsToPatient
};
