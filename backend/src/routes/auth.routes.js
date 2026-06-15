const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { generateSecret, generateURI, verify } = require('otplib');
const qrcode = require('qrcode');
const { generateRegistrationOptions, verifyRegistrationResponse, 
        generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');

const prisma = require('../config/prisma');
const authenticateToken = require('../middleware/authenticate');
const { authLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { registerSchema, loginSchema } = require('../schemas/auth.schema');
const { encrypt, decrypt } = require('../../utils/cipher');
const { sendOTPEmail, sendSecurityAlertEmail } = require('../../utils/mailer');

// POST /api/auth/register
router.post('/register', validate(registerSchema), async (req, res) => {
    try {
        const { email, password, firstName, lastName, dateOfBirth, phone } = req.body;

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: "Email is already registered" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                role: "PATIENT",
                patientProfile: {
                    create: {
                        firstName,
                        lastName,
                        dateOfBirth: new Date(dateOfBirth),
                        phone
                    }
                }
            }
        });

        const token = jwt.sign({ id: newUser.id, role: newUser.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 1 day
        });

        res.status(201).json({ message: "Patient registered successfully!", role: newUser.role });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Registration failed" });
    }
});

// POST /api/auth/login
router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({
             where: { email },
             include: { passkeys: true }
            });
        if (!user) return res.status(400).json({ error: "Invalid email or password" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Invalid email or password" });

        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const currentIp = rawIp.split(',')[0].trim();
        const currentDevice = req.headers['user-agent'];

        if (user.lastLoginIp && user.lastLoginIp !== currentIp) {
            
            let locationString = "Unknown Location";
            
            if (currentIp === '::1' || currentIp === '127.0.0.1') {
                 locationString = "Local Development Network";
            } else {
                 try {
                     const geoRes = await fetch(`https://get.geojs.io/v1/ip/geo/${currentIp}.json`);
                     if (geoRes.ok) {
                         const geoData = await geoRes.json();
                         locationString = `${geoData.city}, ${geoData.country}`;
                     }
                 } catch (err) {
                     console.error("Failed to fetch Geolocation", err);
                 }
            }

            await sendSecurityAlertEmail(user.email, locationString, currentDevice);
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { 
                lastLoginIp: currentIp,
                lastLoginDevice: currentDevice
            }
        });

        const availableMethods = ['EMAIL'];
        if (user.isTwoFactorEnabled) availableMethods.push('APP');

        if (user.passkeys && user.passkeys.length > 0) availableMethods.push('BIOMETRICS');

        return res.json({ 
            requires2FA: true, 
            userId: user.id, 
            methods: availableMethods 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Login failed" });
    }
});

// POST /api/auth/2fa/send-email
router.post('/2fa/send-email', authLimiter, async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ error: "User not found" });

        // Generate a random 6-digit code and set expiry to 10 minutes from now
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60000);

        // Hash the OTP before storing — never persist plaintext codes
        const hashedOtp = await bcrypt.hash(otpCode, 10);

        await prisma.user.update({
            where: { id: userId },
            data: { emailOtpCode: hashedOtp, emailOtpExpiresAt: expiresAt }
        });

        await sendOTPEmail(user.email, otpCode);
        res.json({ message: "Security code sent to your email." });

    } catch (error) {
        console.error("🚨 EMAIL DISPATCH ERROR:", error);
        res.status(500).json({ error: "Failed to send email." });
    }
});

// POST /api/auth/2fa/generate
router.post('/2fa/generate', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });

        if (!user) return res.status(404).json({ error: "User profile not found." });

        if (user.isTwoFactorEnabled) return res.status(400).json({ error: "2FA is already enabled." });

        const secret = generateSecret();

        await prisma.user.update({
            where: { id: req.user.id },
            data: { twoFactorSecret: secret }
        });

        const otpauth = generateURI({ 
            issuer: 'TotalMed Secure Vault', 
            label: user.email, 
            secret 
        });
        
        const qrCodeUrl = await qrcode.toDataURL(otpauth);

        res.json({ qrCodeUrl, secret });
    } catch (error) {
        console.error("🚨 2FA GENERATION ERROR:", error);
        res.status(500).json({ error: "Failed to generate 2FA code." });
    }
});

// POST /api/auth/2fa/verify-setup
router.post('/2fa/verify-setup', authenticateToken, async (req, res) => {
    try {
        const { token } = req.body;
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });

        if (!user.twoFactorSecret) return res.status(400).json({ error: "No 2FA setup in progress." });

        const isValid = verify({ token, secret: user.twoFactorSecret });

        if (isValid) {
            // Lock it in!
            await prisma.user.update({
                where: { id: req.user.id },
                data: { isTwoFactorEnabled: true,
                        twoFactorSecret: encrypt(user.twoFactorSecret)
                 }
            });
            res.json({ message: "2FA successfully enabled!" });
        } else {
            res.status(400).json({ error: "Invalid authenticator code. Please try again." });
        }
    } catch (error) {
        console.error("🚨 2FA VERIFY ERROR:", error);
        res.status(500).json({ error: "Failed to verify 2FA." });
    }
});

// POST /api/auth/2fa/validate
router.post('/2fa/validate', async (req, res) => {
    try {
        const { userId, token, method } = req.body;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(400).json({ error: "Invalid request." });

        let isValid = false;

        if (method === 'APP') {
            if (!user.isTwoFactorEnabled) return res.status(400).json({ error: "App 2FA is not enabled." });
            
            const decryptedSecret = decrypt(user.twoFactorSecret);
            
            if (!decryptedSecret) return res.status(500).json({ error: "Security error: Could not read 2FA key." });

            isValid = verify({ token, secret: decryptedSecret });

        } else if (method === 'EMAIL') {
            if (!user.emailOtpCode || !user.emailOtpExpiresAt) return res.status(400).json({ error: "No email code requested." });
            if (new Date() > user.emailOtpExpiresAt) return res.status(400).json({ error: "Code expired. Please request a new one." });
            isValid = await bcrypt.compare(token, user.emailOtpCode);
        }

        if (isValid) {
            await prisma.user.update({
                where: { id: user.id },
                data: { emailOtpCode: null, emailOtpExpiresAt: null }
            });

            const jwtToken = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
            res.cookie('token', jwtToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
                maxAge: 24 * 60 * 60 * 1000
            });
            res.json({ message: "Logged in successfully", role: user.role });
        } else {
            res.status(400).json({ error: "Invalid verification code." });
        }
    } catch (error) {
        console.error("🚨 2FA VALIDATION ERROR:", error);
        res.status(500).json({ error: "Failed to validate code." });
    }
});

// GET /api/auth/webauthn/generate-registration
router.get('/webauthn/generate-registration', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ 
            where: { id: req.user.id },
            include: { passkeys: true }
        });

        const origin = req.headers.origin || 'http://localhost:5173';
        const rpID = new URL(origin).hostname;

        const options = await generateRegistrationOptions({
            rpName: 'TotalMed Secure Vault',
            rpID,
            userID: new Uint8Array(Buffer.from(user.id)),
            userName: user.email,

            excludeCredentials: user.passkeys.map(passkey => ({
                id: passkey.credentialId,
                type: 'public-key',
            })),
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'preferred',
                authenticatorAttachment: 'platform',
            },
        });

        await prisma.user.update({
            where: { id: user.id },
            data: { webAuthnChallenge: options.challenge }
        });

        res.json(options);
    } catch (error) {
        console.error("🚨 WEBAUTHN GENERATE ERROR:", error);
        res.status(500).json({ error: "Failed to generate biometrics challenge." });
    }
});

// POST /api/auth/webauthn/verify-registration
router.post('/webauthn/verify-registration', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const expectedChallenge = user.webAuthnChallenge;

        if (!expectedChallenge) return res.status(400).json({ error: "No challenge found." });

        const origin = req.headers.origin || 'http://localhost:5173';
        const rpID = new URL(origin).hostname;

        const verification = await verifyRegistrationResponse({
            response: req.body,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
        });

        if (verification.verified) {
            const { registrationInfo } = verification;
            
            const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;

            await prisma.passkey.create({
                data: {
                    userId: user.id,
                    webauthnUserId: user.id,
                    credentialId: credential.id,
                    credentialPublicKey: Buffer.from(credential.publicKey),
                    counter: credential.counter,
                    deviceType: credentialDeviceType,
                    backedUp: credentialBackedUp,
                }
            });

            await prisma.user.update({
                where: { id: user.id },
                data: { webAuthnChallenge: null }
            });

            res.json({ message: "Biometrics successfully registered!" });
        } else {
            res.status(400).json({ error: "Biometric verification failed." });
        }
    } catch (error) {
        console.error("🚨 WEBAUTHN VERIFY ERROR:", error);
        res.status(500).json({ error: "Failed to verify biometrics." });
    }
});

// POST /api/auth/webauthn/generate-authentication
router.post('/webauthn/generate-authentication', async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await prisma.user.findUnique({ where: { id: userId }, include: { passkeys: true } });
        
        const origin = req.headers.origin || 'http://localhost:5173';
        const rpID = new URL(origin).hostname;

        const options = await generateAuthenticationOptions({
            rpID,
            // Only allow devices that this specific user has registered
            allowCredentials: user.passkeys.map(passkey => ({
                id: passkey.credentialId,
                type: 'public-key',
            })),
            userVerification: 'preferred',
        });

        await prisma.user.update({
            where: { id: user.id },
            data: { webAuthnChallenge: options.challenge }
        });

        res.json(options);
    } catch (error) {
        console.error("🚨 AUTH GENERATE ERROR:", error);
        res.status(500).json({ error: "Failed to generate login challenge." });
    }
});

// POST /api/auth/webauthn/verify-authentication
router.post('/webauthn/verify-authentication', async (req, res) => {
    try {
        const { userId, response } = req.body;
        const user = await prisma.user.findUnique({ where: { id: userId }, include: { passkeys: true } });
        
        const expectedChallenge = user.webAuthnChallenge;
        // Find the specific device the user just scanned
        const passkey = user.passkeys.find(pk => pk.credentialId === response.id);

        if (!passkey) return res.status(400).json({ error: "Unrecognized device." });

        const origin = req.headers.origin || 'http://localhost:5173';
        const rpID = new URL(origin).hostname;

        const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            credential: {
                id: passkey.credentialId,
                publicKey: passkey.credentialPublicKey,
                counter: passkey.counter,
            }
        });

        if (verification.verified) {
            // Update the secure counter to prevent replay attacks
            await prisma.passkey.update({
                where: { id: passkey.id },
                data: { counter: verification.authenticationInfo.newCounter }
            });
            await prisma.user.update({ where: { id: user.id }, data: { webAuthnChallenge: null } });

            // LOG THEM IN!
            const jwtToken = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
            res.cookie('token', jwtToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
                maxAge: 24 * 60 * 60 * 1000
            });
            res.json({ message: "Biometrics Verified! Welcome.", role: user.role });
        } else {
            res.status(400).json({ error: "Biometric verification failed." });
        }
    } catch (error) {
        console.error("🚨 AUTH VERIFY ERROR:", error);
        res.status(500).json({ error: "Failed to verify biometrics." });
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
    res.json({ message: "Logged out successfully" });
});

module.exports = router;
