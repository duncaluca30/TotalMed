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

module.exports = { encrypt, decrypt };