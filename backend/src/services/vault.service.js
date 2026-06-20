const crypto = require('crypto');
const qrcode = require('qrcode');
const prisma = require('../config/prisma');
const { encrypt, decrypt } = require('../../utils/cipher');
const { attachMetaToRecords } = require('./attachment.service');
const { attachToRecords: attachAmendmentsToRecords } = require('./amendment.service');

/**
 * Look up an access code by decrypting all active codes and matching.
 * Returns the matching AccessCode record or null.
 */
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

/**
 * Generate a new 6-digit access code for a patient.
 * If an unexpired code already exists, returns it instead.
 * Returns { code: string, expiresAt: Date }
 */
async function generateAccessCode(patientId) {
    const existingCode = await prisma.accessCode.findUnique({
        where: { patientId }
    });

    if (existingCode) {
        if (new Date() < existingCode.expiresAt) {
            const decryptedCode = decrypt(existingCode.code);
            const qrDataUrl = await qrcode.toDataURL(decryptedCode);
            return { code: decryptedCode, expiresAt: existingCode.expiresAt, qrDataUrl };
        } else {
            await prisma.accessCode.delete({ where: { id: existingCode.id } });
        }
    }

    // crypto.randomInt is cryptographically secure and unbiased over [100000, 999999]
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

    const qrDataUrl = await qrcode.toDataURL(rawCode);
    return { code: rawCode, expiresAt: newCode.expiresAt, qrDataUrl };
}

/**
 * Fetch and decrypt medical records for a patient, with pagination.
 * Returns { records: MedicalRecord[], total: number }
 */
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

/**
 * Decrypt a batch of medical records in place (when records are already loaded).
 */
function decryptRecords(records) {
    records.forEach(record => {
        if (record.diagnosis) record.diagnosis = decrypt(record.diagnosis);
        if (record.treatment) record.treatment = decrypt(record.treatment);
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

/**
 * Create an encrypted medical record.
 */
async function createEncryptedRecord({ diagnosis, treatment, notes, patientId, doctorId }) {
    return prisma.medicalRecord.create({
        data: {
            diagnosis: encrypt(diagnosis),
            treatment: encrypt(treatment),
            notes: notes ? encrypt(notes) : null,
            patientId,
            doctorId
        }
    });
}

// Genesis value used as the previous-hash of the very first audit entry.
const AUDIT_GENESIS = 'GENESIS';

// Deterministic hash of an entry's stable fields, chained to the previous entry.
function computeEntryHash({ id, userId, action, details, ipAddress, createdAt, prevHash }) {
    const payload = [id, userId, action, details ?? '', ipAddress ?? '', new Date(createdAt).toISOString(), prevHash].join('|');
    return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Create an audit log entry as the next link in a tamper-evident hash chain.
 * Each row stores the previous row's hash plus a hash of its own fields, so any
 * later edit or deletion breaks the chain (detected by the admin verify check).
 * Wrapped in a transaction so the "read latest → append" step is atomic.
 */
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

/**
 * Recompute the audit-log hash chain in order and report the first entry where
 * it breaks. Returns { ok: true } if intact, otherwise { ok: false, brokenAtId }.
 */
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

/**
 * Build the patient-facing access log: every audited action whose details
 * reference this patient (vault views, records/allergies/medications added),
 * with the acting doctor resolved to a readable name.
 */
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

    // Resolve the patient's own user id so their self-service actions read as
    // "You" rather than "Unknown user".
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
    getDecryptedRecords,
    decryptRecords,
    createEncryptedRecord,
    createAuditLog,
    verifyAuditChain,
    getPatientAccessLog
};
