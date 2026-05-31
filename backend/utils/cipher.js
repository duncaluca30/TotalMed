const crypto = require('crypto');

// Upgraded to GCM mode for tampering protection
const algorithm = 'aes-256-gcm'; 
const secretKey = process.env.MASTER_ENCRYPTION_KEY;

function encrypt(text) {
    if (!text) return text;
    
    // 🚨 FIX: Generate a completely random IV every single time!
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
    
    let encrypted = cipher.update(text.toString(), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Return all three pieces combined so we can decrypt it later
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
        // 🚨 FIX: Prevents your whole server from crashing if the DB is corrupted
        console.error("Decryption failed. Data may be tampered with or key is wrong.");
        return null;
    }
}

module.exports = { encrypt, decrypt };