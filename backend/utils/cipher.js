const crypto = require('crypto');
const algorithm = 'aes-256-cbc';
const secretKey = process.env.MASTER_ENCRYPTION_KEY;


const staticIV = Buffer.alloc(16, 0); 

function encrypt(text) {
    if (!text) return text;
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), staticIV);
    let encrypted = cipher.update(text.toString());
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return encrypted.toString('hex');
}

function decrypt(text) {
    if (!text) return text;
    const encryptedText = Buffer.from(text, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey), staticIV);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

module.exports = { encrypt, decrypt };