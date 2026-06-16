const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: { error: "Too many attempts. Please try again in 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
});

const vaultLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many vault access attempts. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
});

// Protects the second factor from brute-force. A 6-digit code has only 1M
// combinations, so without a limit here an attacker who already has the password
// could try to guess the OTP/TOTP.
const twoFactorLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many verification attempts. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = { authLimiter, vaultLimiter, twoFactorLimiter };
