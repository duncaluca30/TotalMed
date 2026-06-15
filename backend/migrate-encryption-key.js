/**
 * migrate-encryption-key.js
 * 
 * Re-encrypts all 2FA secrets from an OLD encryption key to a NEW one.
 * 
 * Usage:
 *   node migrate-encryption-key.js <OLD_KEY> <NEW_KEY>
 * 
 * Example:
 *   node migrate-encryption-key.js "TotalMed_Super_Secret_Key_2026!!" "61726c81398be1beedaf45bbff12c038422886666564224a9dfb837c9c2c7d85"
 * 
 * What this does:
 *   1. Finds all users with an encrypted twoFactorSecret
 *   2. Decrypts each secret with the OLD key
 *   3. Re-encrypts it with the NEW key
 *   4. Saves the updated ciphertext back to the database
 * 
 * Access codes are ephemeral (expire in 60 min) and don't need migration.
 */

require('dotenv').config();
const crypto = require('crypto');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const algorithm = 'aes-256-gcm';

function parseKey(keyString) {
    // Hex-encoded key (64 hex chars = 32 bytes)
    if (keyString.length === 64 && /^[0-9a-f]+$/i.test(keyString)) {
        return Buffer.from(keyString, 'hex');
    }
    // Legacy ASCII key (must be exactly 32 bytes)
    return Buffer.from(keyString);
}

function decryptWithKey(text, key) {
    if (!text) return text;
    try {
        const parts = text.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];
        const authTag = Buffer.from(parts[2], 'hex');

        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        return null;
    }
}

function encryptWithKey(text, key) {
    if (!text) return text;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(text.toString(), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length !== 2) {
        console.error('Usage: node migrate-encryption-key.js <OLD_KEY> <NEW_KEY>');
        console.error('Example: node migrate-encryption-key.js "TotalMed_Super_Secret_Key_2026!!" "61726c..."');
        process.exit(1);
    }

    const oldKey = parseKey(args[0]);
    const newKey = parseKey(args[1]);

    console.log(`Old key: ${oldKey.length} bytes | New key: ${newKey.length} bytes`);

    if (oldKey.length !== 32 || newKey.length !== 32) {
        console.error('Both keys must be exactly 32 bytes. Aborting.');
        process.exit(1);
    }

    // Find all users who have an encrypted 2FA secret
    const usersWithTOTP = await prisma.user.findMany({
        where: {
            isTwoFactorEnabled: true,
            twoFactorSecret: { not: null }
        },
        select: { id: true, email: true, twoFactorSecret: true }
    });

    console.log(`\nFound ${usersWithTOTP.length} user(s) with encrypted 2FA secrets.\n`);

    if (usersWithTOTP.length === 0) {
        console.log('Nothing to migrate. Done!');
        return;
    }

    let success = 0;
    let failed = 0;

    for (const user of usersWithTOTP) {
        const decrypted = decryptWithKey(user.twoFactorSecret, oldKey);

        if (!decrypted) {
            console.error(`  ❌ FAILED to decrypt 2FA secret for ${user.email} — skipping (may already use new key?)`);
            failed++;
            continue;
        }

        const reEncrypted = encryptWithKey(decrypted, newKey);

        await prisma.user.update({
            where: { id: user.id },
            data: { twoFactorSecret: reEncrypted }
        });

        console.log(`  ✅ Migrated 2FA secret for ${user.email}`);
        success++;
    }

    console.log(`\n🏁 Migration complete: ${success} migrated, ${failed} failed.`);
}

main()
    .catch((e) => {
        console.error('🚨 Migration error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
