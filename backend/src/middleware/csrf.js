const crypto = require('crypto');

const CSRF_COOKIE_NAME = 'csrf-token';

function generateCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
}

function setCsrfCookie(res, token) {
    res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000
    });
}

const EXEMPT_ROUTES = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/logout',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/verify-email',
    '/api/auth/resend-verification',
    '/api/auth/2fa/send-email',
    '/api/auth/2fa/validate',
    '/api/auth/webauthn/generate-authentication',
    '/api/auth/webauthn/verify-authentication',
    '/api/status'
];

function csrfProtection(req, res, next) {

    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    if (EXEMPT_ROUTES.includes(req.path)) {
        return next();
    }

    const cookieToken = req.cookies[CSRF_COOKIE_NAME];
    const headerToken = req.headers['x-csrf-token'];

    if (!cookieToken || !headerToken) {
        console.warn(`⚠️ CSRF REJECTED (missing token) — ${req.method} ${req.path} | cookie: ${!!cookieToken}, header: ${!!headerToken}`);
        return res.status(403).json({ error: "CSRF validation failed: missing token." });
    }

    if (cookieToken.length !== headerToken.length ||
        !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
        console.warn(`⚠️ CSRF REJECTED (mismatch) — ${req.method} ${req.path}`);
        return res.status(403).json({ error: "CSRF validation failed: token mismatch." });
    }

    next();
}

module.exports = { csrfProtection, generateCsrfToken, setCsrfCookie };
