// One-off: populate prevHash/entryHash for AuditLog rows created before the
// tamper-evident hash chain existed. Idempotent — safe to run more than once
// (it simply recomputes the whole chain in createdAt order).
require('dotenv').config();
const crypto = require('crypto');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })) });

const AUDIT_GENESIS = 'GENESIS';
function computeEntryHash({ id, userId, action, details, ipAddress, createdAt, prevHash }) {
    const payload = [id, userId, action, details ?? '', ipAddress ?? '', new Date(createdAt).toISOString(), prevHash].join('|');
    return crypto.createHash('sha256').update(payload).digest('hex');
}

(async () => {
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
    let prevHash = AUDIT_GENESIS;
    let updated = 0;
    for (const log of logs) {
        const entryHash = computeEntryHash({ ...log, prevHash });
        if (log.prevHash !== prevHash || log.entryHash !== entryHash) {
            await prisma.auditLog.update({ where: { id: log.id }, data: { prevHash, entryHash } });
            updated++;
        }
        prevHash = entryHash;
    }
    console.log(`✅ Audit chain backfilled. ${logs.length} entries, ${updated} updated.`);
    await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
