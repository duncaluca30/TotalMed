const express = require('express');
const router = express.Router();

const authenticateToken = require('../middleware/authenticate');
const { authLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { registerSchema, loginSchema } = require('../schemas/auth.schema');
const { generateCsrfToken, setCsrfCookie } = require('../middleware/csrf');

const {
    registerUser,
    authenticateUser,
    sendEmailOTP,
    validate2FA,
    generate2FASetup,
    verify2FASetup,
    generateWebAuthnRegistration,
    verifyWebAuthnRegistration,
    generateWebAuthnAuthentication,
    verifyWebAuthnAuthentication,
    signUserToken,
    setAuthCookie
} = require('../services/auth.service');

// Helper: complete login by setting cookies and responding
function completeLogin(res, user, message, statusCode = 200) {
    const token = signUserToken(user);
    const csrfToken = generateCsrfToken();
    setAuthCookie(res, token);
    setCsrfCookie(res, csrfToken);
    res.status(statusCode).json({ message, role: user.role, csrfToken });
}

// POST /api/auth/register
router.post('/register', validate(registerSchema), async (req, res) => {
    try {
        const newUser = await registerUser(req.body);
        completeLogin(res, newUser, "Patient registered successfully!", 201);
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ error: error.message || "Registration failed" });
    }
});

// POST /api/auth/login
router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
    try {
        const { email, password } = req.body;
        const { user, availableMethods } = await authenticateUser(email, password, req);

        return res.json({
            requires2FA: true,
            userId: user.id,
            methods: availableMethods
        });
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ error: error.message || "Login failed" });
    }
});

// POST /api/auth/2fa/send-email
router.post('/2fa/send-email', authLimiter, async (req, res) => {
    try {
        await sendEmailOTP(req.body.userId);
        res.json({ message: "Security code sent to your email." });
    } catch (error) {
        console.error("🚨 EMAIL DISPATCH ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to send email." });
    }
});

// POST /api/auth/2fa/generate
router.post('/2fa/generate', authenticateToken, async (req, res) => {
    try {
        const data = await generate2FASetup(req.user.id);
        res.json(data);
    } catch (error) {
        console.error("🚨 2FA GENERATION ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to generate 2FA code." });
    }
});

// POST /api/auth/2fa/verify-setup
router.post('/2fa/verify-setup', authenticateToken, async (req, res) => {
    try {
        await verify2FASetup(req.user.id, req.body.token);
        res.json({ message: "2FA successfully enabled!" });
    } catch (error) {
        console.error("🚨 2FA VERIFY ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to verify 2FA." });
    }
});

// POST /api/auth/2fa/validate
router.post('/2fa/validate', async (req, res) => {
    try {
        const { userId, token, method } = req.body;
        const user = await validate2FA(userId, token, method);
        completeLogin(res, user, "Logged in successfully");
    } catch (error) {
        console.error("🚨 2FA VALIDATION ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to validate code." });
    }
});

// GET /api/auth/webauthn/generate-registration
router.get('/webauthn/generate-registration', authenticateToken, async (req, res) => {
    try {
        const origin = req.headers.origin || 'http://localhost:5173';
        const options = await generateWebAuthnRegistration(req.user.id, origin);
        res.json(options);
    } catch (error) {
        console.error("🚨 WEBAUTHN GENERATE ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to generate biometrics challenge." });
    }
});

// POST /api/auth/webauthn/verify-registration
router.post('/webauthn/verify-registration', authenticateToken, async (req, res) => {
    try {
        const origin = req.headers.origin || 'http://localhost:5173';
        await verifyWebAuthnRegistration(req.user.id, req.body, origin);
        res.json({ message: "Biometrics successfully registered!" });
    } catch (error) {
        console.error("🚨 WEBAUTHN VERIFY ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to verify biometrics." });
    }
});

// POST /api/auth/webauthn/generate-authentication
router.post('/webauthn/generate-authentication', async (req, res) => {
    try {
        const origin = req.headers.origin || 'http://localhost:5173';
        const options = await generateWebAuthnAuthentication(req.body.userId, origin);
        res.json(options);
    } catch (error) {
        console.error("🚨 AUTH GENERATE ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to generate login challenge." });
    }
});

// POST /api/auth/webauthn/verify-authentication
router.post('/webauthn/verify-authentication', async (req, res) => {
    try {
        const { userId, response } = req.body;
        const origin = req.headers.origin || 'http://localhost:5173';
        const user = await verifyWebAuthnAuthentication(userId, response, origin);
        completeLogin(res, user, "Biometrics Verified! Welcome.");
    } catch (error) {
        console.error("🚨 AUTH VERIFY ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to verify biometrics." });
    }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
    // If the middleware passes, we know the user is authenticated via cookie
    res.json({ role: req.user.role });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    });
    res.clearCookie('csrf-token', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    });
    res.json({ message: "Logged out successfully" });
});

module.exports = router;
