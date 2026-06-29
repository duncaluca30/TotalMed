const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { generateSecret, generateURI, verify } = require('otplib');
const qrcode = require('qrcode');
const { generateRegistrationOptions, verifyRegistrationResponse,
        generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');

const prisma = require('../config/prisma');
const { encrypt, decrypt } = require('../../utils/cipher');
const { sendOTPEmail, sendSecurityAlertEmail, sendPasswordResetEmail, sendVerificationEmail } = require('../../utils/mailer');
const notifications = require('./notification.service');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const TOTP_TOLERANCE_SECONDS = 30;

const hashResetToken = hashToken;

async function registerUser({ email, password, firstName, lastName, dateOfBirth, phone, cnp }, baseUrl) {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        const error = new Error("Email is already registered");
        error.status = 400;
        throw error;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60000);

    const user = await prisma.user.create({
        data: {
            email,
            password: hashedPassword,
            role: "PATIENT",
            isEmailVerified: false,
            emailVerificationToken: hashToken(rawToken),
            emailVerificationExpiresAt: expiresAt,
            patientProfile: {
                create: {
                    firstName,
                    lastName,
                    dateOfBirth: new Date(dateOfBirth),
                    phone,
                    ...(cnp ? { cnp } : {})
                }
            }
        }
    });

    if (baseUrl) {
        const verifyUrl = `${baseUrl.replace(/\/$/, '')}/verify-email?token=${rawToken}`;
        await sendVerificationEmail(user.email, verifyUrl);
    }

    return user;
}

async function verifyEmail(token) {
    if (!token) {
        const error = new Error("Invalid or expired verification link.");
        error.status = 400;
        throw error;
    }

    const user = await prisma.user.findFirst({
        where: {
            emailVerificationToken: hashToken(token),
            emailVerificationExpiresAt: { gt: new Date() }
        }
    });

    if (!user) {
        const error = new Error("Invalid or expired verification link. Please request a new one.");
        error.status = 400;
        throw error;
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { isEmailVerified: true, emailVerificationToken: null, emailVerificationExpiresAt: null }
    });
}

async function resendVerification(email, baseUrl) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.isEmailVerified) return;

    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60000);

    await prisma.user.update({
        where: { id: user.id },
        data: { emailVerificationToken: hashToken(rawToken), emailVerificationExpiresAt: expiresAt }
    });

    if (baseUrl) {
        const verifyUrl = `${baseUrl.replace(/\/$/, '')}/verify-email?token=${rawToken}`;
        await sendVerificationEmail(user.email, verifyUrl);
    }
}

async function authenticateUser(email, password, req) {
    const user = await prisma.user.findUnique({
        where: { email },
        include: { passkeys: true }
    });

    if (!user) {
        const error = new Error("Invalid email or password");
        error.status = 400;
        throw error;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        const error = new Error("Invalid email or password");
        error.status = 400;
        throw error;
    }

    if (!user.isEmailVerified) {
        const error = new Error("Please verify your email before signing in. Check your inbox for the confirmation link.");
        error.status = 403;
        throw error;
    }

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
        await notifications.create(
            user.id,
            'NEW_LOGIN',
            'New login detected',
            `A login to your account was detected from ${locationString}.`
        );
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
    if (user.twoFactorBackupCodes && user.twoFactorBackupCodes.length > 0) availableMethods.push('BACKUP');

    return { user, availableMethods };
}

async function generateBackupCodes(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        const error = new Error("User not found.");
        error.status = 404;
        throw error;
    }

    const raws = Array.from({ length: 10 }, () => crypto.randomBytes(5).toString('hex'));

    await prisma.user.update({
        where: { id: userId },
        data: { twoFactorBackupCodes: raws.map(hashToken) }
    });

    return raws.map((raw) => `${raw.slice(0, 5)}-${raw.slice(5)}`);
}

async function logoutAll(userId) {
    await prisma.user.update({
        where: { id: userId },
        data: { sessionValidAfter: new Date() }
    });
}

async function sendEmailOTP(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        const error = new Error("User not found");
        error.status = 404;
        throw error;
    }

    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000);
    const hashedOtp = await bcrypt.hash(otpCode, 10);

    await prisma.user.update({
        where: { id: userId },
        data: { emailOtpCode: hashedOtp, emailOtpExpiresAt: expiresAt }
    });

    await sendOTPEmail(user.email, otpCode);
}

async function validate2FA(userId, token, method) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        const error = new Error("Invalid request.");
        error.status = 400;
        throw error;
    }

    let isValid = false;

    if (method === 'APP') {
        if (!user.isTwoFactorEnabled) {
            const error = new Error("App 2FA is not enabled.");
            error.status = 400;
            throw error;
        }

        const decryptedSecret = decrypt(user.twoFactorSecret);
        if (!decryptedSecret) {
            const error = new Error("Security error: Could not read 2FA key.");
            error.status = 500;
            throw error;
        }

        const result = await verify({ token, secret: decryptedSecret, epochTolerance: TOTP_TOLERANCE_SECONDS });
        isValid = result.valid;
    } else if (method === 'EMAIL') {
        if (!user.emailOtpCode || !user.emailOtpExpiresAt) {
            const error = new Error("No email code requested.");
            error.status = 400;
            throw error;
        }
        if (new Date() > user.emailOtpExpiresAt) {
            const error = new Error("Code expired. Please request a new one.");
            error.status = 400;
            throw error;
        }
        isValid = await bcrypt.compare(token, user.emailOtpCode);
    } else if (method === 'BACKUP') {

        const canonical = (token || '').toString().trim().toLowerCase().replace(/[\s-]/g, '');
        const stored = user.twoFactorBackupCodes || [];
        const candidateHash = hashToken(canonical);
        const matchHash = stored.includes(candidateHash) ? candidateHash : null;
        if (matchHash) {
            isValid = true;

            await prisma.user.update({
                where: { id: user.id },
                data: { twoFactorBackupCodes: stored.filter((h) => h !== matchHash) }
            });
        }
    }

    if (!isValid) {
        const error = new Error("Invalid verification code.");
        error.status = 400;
        throw error;
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { emailOtpCode: null, emailOtpExpiresAt: null }
    });

    return user;
}

async function generate2FASetup(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        const error = new Error("User profile not found.");
        error.status = 404;
        throw error;
    }
    if (user.isTwoFactorEnabled) {
        const error = new Error("2FA is already enabled.");
        error.status = 400;
        throw error;
    }

    const secret = generateSecret();

    await prisma.user.update({
        where: { id: userId },
        data: { twoFactorSecret: encrypt(secret) }
    });

    const otpauth = generateURI({
        issuer: 'TotalMed Secure Vault',
        label: user.email,
        secret
    });

    const qrCodeUrl = await qrcode.toDataURL(otpauth);
    return { qrCodeUrl, secret };
}

async function verify2FASetup(userId, token) {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user.twoFactorSecret) {
        const error = new Error("No 2FA setup in progress.");
        error.status = 400;
        throw error;
    }

    const decryptedSecret = decrypt(user.twoFactorSecret);
    if (!decryptedSecret) {
        const error = new Error("Security error: Could not read 2FA key.");
        error.status = 500;
        throw error;
    }

    const isValid = (await verify({ token, secret: decryptedSecret, epochTolerance: TOTP_TOLERANCE_SECONDS })).valid;

    if (!isValid) {
        const error = new Error("Invalid authenticator code. Please try again.");
        error.status = 400;
        throw error;
    }

    await prisma.user.update({
        where: { id: userId },
        data: { isTwoFactorEnabled: true }
    });
}

async function generateWebAuthnRegistration(userId, origin) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { passkeys: true }
    });

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
            userVerification: 'required',
            authenticatorAttachment: 'platform',
        },
    });

    await prisma.user.update({
        where: { id: user.id },
        data: { webAuthnChallenge: options.challenge }
    });

    return options;
}

async function verifyWebAuthnRegistration(userId, body, origin) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const expectedChallenge = user.webAuthnChallenge;

    if (!expectedChallenge) {
        const error = new Error("No challenge found.");
        error.status = 400;
        throw error;
    }

    const rpID = new URL(origin).hostname;

    const verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
    });

    if (!verification.verified) {
        const error = new Error("Biometric verification failed.");
        error.status = 400;
        throw error;
    }

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
}

async function generateWebAuthnAuthentication(userId, origin) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { passkeys: true }
    });

    const rpID = new URL(origin).hostname;

    const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials: user.passkeys.map(passkey => ({
            id: passkey.credentialId,
            type: 'public-key',
        })),
        userVerification: 'required',
    });

    await prisma.user.update({
        where: { id: user.id },
        data: { webAuthnChallenge: options.challenge }
    });

    return options;
}

async function verifyWebAuthnAuthentication(userId, response, origin) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { passkeys: true }
    });

    const expectedChallenge = user.webAuthnChallenge;
    const passkey = user.passkeys.find(pk => pk.credentialId === response.id);

    if (!passkey) {
        const error = new Error("Unrecognized device.");
        error.status = 400;
        throw error;
    }

    const rpID = new URL(origin).hostname;

    const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
            id: passkey.credentialId,
            publicKey: passkey.credentialPublicKey,
            counter: passkey.counter,
        }
    });

    if (!verification.verified) {
        const error = new Error("Biometric verification failed.");
        error.status = 400;
        throw error;
    }

    await prisma.passkey.update({
        where: { id: passkey.id },
        data: { counter: verification.authenticationInfo.newCounter }
    });
    await prisma.user.update({
        where: { id: user.id },
        data: { webAuthnChallenge: null }
    });

    return user;
}

async function requestPasswordReset(email, baseUrl) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60000);

    await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken: hashResetToken(rawToken), passwordResetExpiresAt: expiresAt }
    });

    const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${rawToken}`;
    await sendPasswordResetEmail(user.email, resetUrl);
}

async function resetPassword(token, newPassword) {
    if (!token) {
        const error = new Error("Invalid or expired reset link.");
        error.status = 400;
        throw error;
    }

    const user = await prisma.user.findFirst({
        where: {
            passwordResetToken: hashResetToken(token),
            passwordResetExpiresAt: { gt: new Date() }
        }
    });

    if (!user) {
        const error = new Error("Invalid or expired reset link. Please request a new one.");
        error.status = 400;
        throw error;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
        where: { id: user.id },
        data: {
            password: hashedPassword,
            passwordResetToken: null,
            passwordResetExpiresAt: null,

            sessionValidAfter: new Date()
        }
    });
}

async function changePassword(userId, currentPassword, newPassword) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        const error = new Error("User not found.");
        error.status = 404;
        throw error;
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
        const error = new Error("Current password is incorrect.");
        error.status = 400;
        throw error;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword, sessionValidAfter: new Date() }
    });
}

function signUserToken(user) {
    return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
}

function setAuthCookie(res, token) {
    res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000
    });
}

module.exports = {
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
};
