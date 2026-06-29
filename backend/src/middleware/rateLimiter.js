const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
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

const twoFactorLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many verification attempts. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = { authLimiter, vaultLimiter, twoFactorLimiter };
