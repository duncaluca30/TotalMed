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

// Caps how fast a doctor can look patients up by CNP. Generous enough for
// legitimate use during a consultation, but low enough to make enumerating the
// (structured) CNP space to harvest patient names impractical.
const searchLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { error: "Too many searches. Please try again in a few minutes." },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = { authLimiter, vaultLimiter, twoFactorLimiter, searchLimiter };
