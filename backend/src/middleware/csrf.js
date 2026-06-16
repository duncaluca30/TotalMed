const crypto = require('crypto');

/**
 * CSRF Protection via Double-Submit Cookie pattern.
 * 
 * How it works:
 * 1. On login, a random CSRF token is set as a readable (non-httpOnly) cookie.
 * 2. The frontend reads this cookie and sends it back as an X-CSRF-Token header.
 * 3. This middleware compares the header value to the cookie value.
 * 
 * Why it works:
 * - An attacker on another origin cannot read our cookies (same-origin policy).
 * - So they cannot set the X-CSRF-Token header to match.
 * - The httpOnly auth cookie is sent automatically, but without the matching header,
 *   the request is rejected.
 */

const CSRF_COOKIE_NAME = 'csrf-token';

function generateCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
}

function setCsrfCookie(res, token) {
    res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false,       // JS must be able to read this
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000  // match JWT expiry
    });
}

// Routes that don't require CSRF (pre-authentication or public)
const EXEMPT_ROUTES = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/logout',
    '/api/auth/2fa/send-email',
    '/api/auth/2fa/validate',
    '/api/auth/webauthn/generate-authentication',
    '/api/auth/webauthn/verify-authentication',
    '/api/status'
];

function csrfProtection(req, res, next) {
    // Only check mutating methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    // Skip exempt routes
    if (EXEMPT_ROUTES.includes(req.path)) {
        return next();
    }

    const cookieToken = req.cookies[CSRF_COOKIE_NAME];
    const headerToken = req.headers['x-csrf-token'];

    if (!cookieToken || !headerToken) {
        return res.status(403).json({ error: "CSRF validation failed: missing token." });
    }

    // Constant-time comparison to prevent timing attacks
    if (cookieToken.length !== headerToken.length ||
        !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
        return res.status(403).json({ error: "CSRF validation failed: token mismatch." });
    }

    next();
}

module.exports = { csrfProtection, generateCsrfToken, setCsrfCookie };
