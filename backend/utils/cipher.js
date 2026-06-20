const crypto = require('crypto');

const algorithm = 'aes-256-gcm'; 
const rawKey = process.env.MASTER_ENCRYPTION_KEY;

// Support both hex-encoded keys (64 hex chars = 32 bytes, recommended)
// and legacy ASCII keys (exactly 32 ASCII chars = 32 bytes)
const secretKey = rawKey.length === 64 && /^[0-9a-f]+$/i.test(rawKey)
    ? Buffer.from(rawKey, 'hex')
    : Buffer.from(rawKey);

function encrypt(text) {
    if (!text) return text;
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
    
    let encrypted = cipher.update(text.toString(), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

function decrypt(text) {
    if (!text) return text;
    
    try {
        const parts = text.split(':');
        if (parts.length !== 3) {
            console.error("Decryption failed: Invalid format.");
            return null;
        }

        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];
        const authTag = Buffer.from(parts[2], 'hex');
        
        const decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey), iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        console.error("Decryption failed. Data may be tampered with or key is wrong.");
        return null;
    }
}

// ── Binary variants (for file attachments) ───────────────────────────────────
// Text encrypt/decrypt above go through hex+utf8, which is fine for short fields
// but wasteful for files. These work directly on Buffers and store the result as
// a single binary blob laid out as: iv(16) | authTag(16) | ciphertext.

function encryptBuffer(buffer) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);

    const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, ciphertext]);
}

function decryptBuffer(blob) {
    const iv = blob.subarray(0, 16);
    const authTag = blob.subarray(16, 32);
    const ciphertext = blob.subarray(32);

    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey), iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

module.exports = { encrypt, decrypt, encryptBuffer, decryptBuffer };