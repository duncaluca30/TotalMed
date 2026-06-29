const crypto = require('crypto');
const qrcode = require('qrcode');
const prisma = require('../config/prisma');
const { encrypt, decrypt } = require('../../utils/cipher');
const { attachMetaToRecords } = require('./attachment.service');
const { attachToRecords: attachAmendmentsToRecords } = require('./amendment.service');

async function lookupAccessCode(code) {
    const activeCodes = await prisma.accessCode.findMany({
        where: { expiresAt: { gt: new Date() } }
    });

    for (const record of activeCodes) {
        const decryptedCode = decrypt(record.code);
        if (decryptedCode === code) {
            return record;
        }
    }

    return null;
}

function buildAccessQrPayload(code, base) {
    return base ? `${base.replace(/\/$/, '')}/doctor?vaultCode=${code}` : code;
}

async function generateAccessCode(patientId, base = null) {
    const existingCode = await prisma.accessCode.findUnique({
        where: { patientId }
    });

    if (existingCode) {
        if (new Date() < existingCode.expiresAt) {
            const decryptedCode = decrypt(existingCode.code);
            const qrDataUrl = await qrcode.toDataURL(buildAccessQrPayload(decryptedCode, base));
            return { code: decryptedCode, expiresAt: existingCode.expiresAt, qrDataUrl };
        } else {
            await prisma.accessCode.delete({ where: { id: existingCode.id } });
        }
    }

    const rawCode = crypto.randomInt(100000, 1000000).toString();
    const encryptedCode = encrypt(rawCode);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 60);

    const newCode = await prisma.accessCode.create({
        data: {
            code: encryptedCode,
            expiresAt,
            patientId
        }
    });

    const qrDataUrl = await qrcode.toDataURL(buildAccessQrPayload(rawCode, base));
    return { code: rawCode, expiresAt: newCode.expiresAt, qrDataUrl };
}

async function getDecryptedRecords(patientId, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const total = await prisma.medicalRecord.count({
        where: { patientId }
    });

    const records = await prisma.medicalRecord.findMany({
        where: { patientId },
        include: { doctor: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
    });

    records.forEach(record => {
        if (record.diagnosis) record.diagnosis = decrypt(record.diagnosis);
        if (record.treatment) record.treatment = decrypt(record.treatment);
        if (record.icdCode) {
            try { record.icdCode = decrypt(record.icdCode); } catch (e) { console.error("Failed to decrypt icdCode for record", record.id); }
        }
        if (record.notes) {
            try {
                record.notes = decrypt(record.notes);
            } catch (e) {
                console.error("Failed to decrypt notes for record", record.id);
            }
        }
    });

    await attachMetaToRecords(records);
    await attachAmendmentsToRecords(records);

    return { records, total };
}

function decryptRecords(records) {
    records.forEach(record => {
        if (record.diagnosis) record.diagnosis = decrypt(record.diagnosis);
        if (record.treatment) record.treatment = decrypt(record.treatment);
        if (record.icdCode) {
            try { record.icdCode = decrypt(record.icdCode); } catch (e) { console.error("Failed to decrypt icdCode for record", record.id); }
        }
        if (record.notes) {
            try {
                record.notes = decrypt(record.notes);
            } catch (e) {
                console.error("Failed to decrypt notes for record", record.id);
            }
        }
    });
    return records;
}

async function createEncryptedRecord({ diagnosis, treatment, notes, icdCode, patientId, doctorId }) {
    return prisma.medicalRecord.create({
        data: {
            diagnosis: encrypt(diagnosis),
            treatment: encrypt(treatment),
            notes: notes ? encrypt(notes) : null,
            icdCode: icdCode ? encrypt(icdCode) : null,
            patientId,
            doctorId
        }
    });
}

const AUDIT_GENESIS = 'GENESIS';

function computeEntryHash({ id, userId, action, details, ipAddress, createdAt, prevHash }) {
    const payload = [id, userId, action, details ?? '', ipAddress ?? '', new Date(createdAt).toISOString(), prevHash].join('|');
    return crypto.createHash('sha256').update(payload).digest('hex');
}

async function createAuditLog({ userId, action, details, ipAddress }) {
    const detailsStr = typeof details === 'string' ? details : JSON.stringify(details);
    const ip = ipAddress ? ipAddress.split(',')[0].trim() : null;

    return prisma.$transaction(async (tx) => {
        const last = await tx.auditLog.findFirst({
            orderBy: { createdAt: 'desc' },
            select: { entryHash: true }
        });
        const prevHash = last?.entryHash || AUDIT_GENESIS;

        const created = await tx.auditLog.create({
            data: { userId, action, details: detailsStr, ipAddress: ip, prevHash }
        });

        const entryHash = computeEntryHash({ ...created, prevHash });
        return tx.auditLog.update({ where: { id: created.id }, data: { entryHash } });
    });
}

async function verifyAuditChain() {
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
    let prevHash = AUDIT_GENESIS;
    for (const log of logs) {
        const expected = computeEntryHash({ ...log, prevHash });
        if (log.prevHash !== prevHash || log.entryHash !== expected) {
            return { ok: false, brokenAtId: log.id, checked: logs.length };
        }
        prevHash = log.entryHash;
    }
    return { ok: true, checked: logs.length };
}

async function getPatientAccessLog(patientId, limit = 100) {
    const logs = await prisma.auditLog.findMany({
        where: { details: { contains: patientId } },
        orderBy: { createdAt: 'desc' },
        take: limit
    });

    const userIds = [...new Set(logs.map(l => l.userId))];
    const doctors = await prisma.doctor.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, firstName: true, lastName: true, specialty: true }
    });
    const byUser = new Map(doctors.map(d => [d.userId, d]));

    const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { userId: true }
    });
    const selfUserId = patient?.userId;

    return logs.map(l => {
        const d = byUser.get(l.userId);
        const actor = d
            ? `Dr. ${d.firstName} ${d.lastName}`
            : (l.userId === selfUserId ? 'You' : 'Unknown user');
        return {
            id: l.id,
            action: l.action,
            actor,
            specialty: d ? d.specialty : null,
            ipAddress: l.ipAddress,
            createdAt: l.createdAt
        };
    });
}

module.exports = {
    lookupAccessCode,
    generateAccessCode,
    buildAccessQrPayload,
    getDecryptedRecords,
    decryptRecords,
    createEncryptedRecord,
    createAuditLog,
    verifyAuditChain,
    getPatientAccessLog
};
