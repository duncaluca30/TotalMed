const crypto = require('crypto');
const prisma = require('../config/prisma');
const { encrypt, decrypt } = require('../../utils/cipher');
const { attachMetaToRecords } = require('./attachment.service');

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
            return { code: decryptedCode, expiresAt: existingCode.expiresAt };
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

    return { code: rawCode, expiresAt: newCode.expiresAt };
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

/**
 * Create an audit log entry.
 */
async function createAuditLog({ userId, action, details, ipAddress }) {
    return prisma.auditLog.create({
        data: {
            userId,
            action,
            details: typeof details === 'string' ? details : JSON.stringify(details),
            ipAddress: ipAddress ? ipAddress.split(',')[0].trim() : null
        }
    });
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
    getPatientAccessLog
};
