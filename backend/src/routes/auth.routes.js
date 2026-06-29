const express = require('express');
const router = express.Router();

const authenticateToken = require('../middleware/authenticate');
const { authLimiter, twoFactorLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema } = require('../schemas/auth.schema');
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
    verifyEmail,
    resendVerification,
    requestPasswordReset,
    resetPassword,
    changePassword,
    generateBackupCodes,
    logoutAll,
    signUserToken,
    setAuthCookie
} = require('../services/auth.service');

function appBaseUrl(req) {
    return req.headers.origin
        || process.env.FRONTEND_URL
        || `${req.protocol}://${req.get('host')}`;
}

function completeLogin(res, user, message, statusCode = 200) {
    const token = signUserToken(user);
    const csrfToken = generateCsrfToken();
    setAuthCookie(res, token);
    setCsrfCookie(res, csrfToken);
    res.status(statusCode).json({ message, role: user.role, csrfToken });
}

router.post('/register', validate(registerSchema), async (req, res) => {
    try {
        await registerUser(req.body, appBaseUrl(req));

        res.status(201).json({ message: "Account created. Check your email for a confirmation link to activate it." });
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ error: error.message || "Registration failed" });
    }
});

router.post('/verify-email', authLimiter, async (req, res) => {
    try {
        await verifyEmail(req.body.token);
        res.json({ message: "Email confirmed. You can now sign in." });
    } catch (error) {
        console.error("🚨 VERIFY EMAIL ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to verify email." });
    }
});

router.post('/resend-verification', authLimiter, validate(forgotPasswordSchema), async (req, res) => {
    try {
        await resendVerification(req.body.email, appBaseUrl(req));
    } catch (error) {
        console.error("🚨 RESEND VERIFICATION ERROR:", error);
    }

    res.json({ message: "If that email needs confirming, a new link has been sent." });
});

router.post('/change-password', authenticateToken, validate(changePasswordSchema), async (req, res) => {
    try {
        await changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);

        const freshUser = { id: req.user.id, role: req.user.role };
        completeLogin(res, freshUser, "Password changed. Other devices have been signed out.");
    } catch (error) {
        console.error("🚨 CHANGE PASSWORD ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to change password." });
    }
});

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

router.post('/2fa/send-email', authLimiter, async (req, res) => {
    try {
        await sendEmailOTP(req.body.userId);
        res.json({ message: "Security code sent to your email." });
    } catch (error) {
        console.error("🚨 EMAIL DISPATCH ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to send email." });
    }
});

router.post('/2fa/generate', authenticateToken, async (req, res) => {
    try {
        const data = await generate2FASetup(req.user.id);
        res.json(data);
    } catch (error) {
        console.error("🚨 2FA GENERATION ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to generate 2FA code." });
    }
});

router.post('/2fa/verify-setup', authenticateToken, async (req, res) => {
    try {
        await verify2FASetup(req.user.id, req.body.token);
        res.json({ message: "2FA successfully enabled!" });
    } catch (error) {
        console.error("🚨 2FA VERIFY ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to verify 2FA." });
    }
});

router.post('/2fa/backup-codes', authenticateToken, async (req, res) => {
    try {
        const codes = await generateBackupCodes(req.user.id);
        res.json({ codes });
    } catch (error) {
        console.error("🚨 BACKUP CODES ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to generate backup codes." });
    }
});

router.post('/logout-all', authenticateToken, async (req, res) => {
    try {
        await logoutAll(req.user.id);

        completeLogin(res, { id: req.user.id, role: req.user.role }, "Signed out of all other devices.");
    } catch (error) {
        console.error("🚨 LOGOUT-ALL ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to sign out other devices." });
    }
});

router.post('/2fa/validate', twoFactorLimiter, async (req, res) => {
    try {
        const { userId, token, method } = req.body;
        const user = await validate2FA(userId, token, method);
        completeLogin(res, user, "Logged in successfully");
    } catch (error) {
        console.error("🚨 2FA VALIDATION ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to validate code." });
    }
});

router.get('/webauthn/generate-registration', authenticateToken, async (req, res) => {
    try {

        const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
        const options = await generateWebAuthnRegistration(req.user.id, origin);
        res.json(options);
    } catch (error) {
        console.error("🚨 WEBAUTHN GENERATE ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to generate biometrics challenge." });
    }
});

router.post('/webauthn/verify-registration', authenticateToken, async (req, res) => {
    try {
        const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
        await verifyWebAuthnRegistration(req.user.id, req.body, origin);
        res.json({ message: "Biometrics successfully registered!" });
    } catch (error) {
        console.error("🚨 WEBAUTHN VERIFY ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to verify biometrics." });
    }
});

router.post('/webauthn/generate-authentication', async (req, res) => {
    try {
        const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
        const options = await generateWebAuthnAuthentication(req.body.userId, origin);
        res.json(options);
    } catch (error) {
        console.error("🚨 AUTH GENERATE ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to generate login challenge." });
    }
});

router.post('/webauthn/verify-authentication', async (req, res) => {
    try {
        const { userId, response } = req.body;
        const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
        const user = await verifyWebAuthnAuthentication(userId, response, origin);
        completeLogin(res, user, "Biometrics Verified! Welcome.");
    } catch (error) {
        console.error("🚨 AUTH VERIFY ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to verify biometrics." });
    }
});

router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), async (req, res) => {
    try {

        const baseUrl = req.headers.origin
            || process.env.FRONTEND_URL
            || `${req.protocol}://${req.get('host')}`;
        await requestPasswordReset(req.body.email, baseUrl);

        res.json({ message: "If an account exists for that email, a reset link has been sent." });
    } catch (error) {
        console.error("🚨 FORGOT PASSWORD ERROR:", error);

        res.json({ message: "If an account exists for that email, a reset link has been sent." });
    }
});

router.post('/reset-password', authLimiter, validate(resetPasswordSchema), async (req, res) => {
    try {
        await resetPassword(req.body.token, req.body.password);
        res.json({ message: "Password updated. You can now sign in with your new password." });
    } catch (error) {
        console.error("🚨 RESET PASSWORD ERROR:", error);
        res.status(error.status || 500).json({ error: error.message || "Failed to reset password." });
    }
});

router.get('/me', authenticateToken, (req, res) => {

    const csrfToken = generateCsrfToken();
    setCsrfCookie(res, csrfToken);
    res.json({ role: req.user.role, csrfToken });
});

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
