require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cron = require('node-cron');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { encrypt, decrypt } = require('./utils/cipher');

// Security Packages
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { generateSecret, generateURI, verify } = require('otplib');
const qrcode = require('qrcode');
const { sendOTPEmail, sendSecurityAlertEmail } = require('./utils/mailer');
const { generateRegistrationOptions, verifyRegistrationResponse, 
        generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');

const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const app = express();
const server = http.createServer(app);

const ALLOWED_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';

const io = new Server(server, {
    cors: { origin: ALLOWED_ORIGIN, methods: ["GET", "POST"] },
    pingInterval: 25000,
    pingTimeout: 60000
});

io.on('connection', (socket) => {
    if (process.env.NODE_ENV !== 'production') {
        console.log('🟢 User connected to switchboard:', socket.id);
    }

    socket.on('join-secure-room', async (token) => {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded.role !== 'PATIENT') return;
            const roomName = decoded.id.toString();

            // Kick any existing sockets already in this room (previous sessions/tabs)
            const socketsInRoom = await io.in(roomName).fetchSockets();
            for (const existingSocket of socketsInRoom) {
                existingSocket.emit('session-replaced');
                existingSocket.leave(roomName);
            }

            socket.join(roomName);
            socket._patientUserId = roomName;
            if (process.env.NODE_ENV !== 'production') {
                console.log(`🔒 Patient secured their connection in room: ${roomName}`);
            }
        } catch (err) {
            socket.disconnect(true);
        }
    });

    socket.on('auth-response', (data) => {
        app.emit(`auth-resolved-${data.code}`, data);
    });

    socket.on('disconnect', () => {
        if (process.env.NODE_ENV !== 'production') {
            console.log('🔴 User disconnected');
        }
    });
});

app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.set('trust proxy', 1);
app.use(express.json());

// Fix #2: Rate limiters
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

const authenticateToken = (req, res, next) => {

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: "Access Denied: No Token Provided" });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Access Denied: Invalid Token" });
        
        req.user = user; 
        next();
    });
};

app.get('/api/status', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1 + 1`;
        res.json({ message: "Medical App API is running securely!", database: "Connected successfully to Neon Postgres!" });
    } catch (error) {
        res.status(500).json({ error: "Database connection failed" });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, firstName, lastName, dateOfBirth, phone } = req.body;

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: "Email is already registered" });
        }

        if (dateOfBirth) {
            const dob = new Date(dateOfBirth);
            if (isNaN(dob.getTime())) {
                return res.status(400).json({ error: "Invalid date of birth." });
            }
            const today = new Date();
            if (dob > today) {
                return res.status(400).json({ error: "Date of birth cannot be in the future." });
            }
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({ 
                error: "Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character." 
            });
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

        res.status(201).json({ message: "Patient registered successfully!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Registration failed" });
    }
});

app.get('/api/auth/webauthn/generate-registration', authenticateToken, async (req, res) => {
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

app.post('/api/auth/webauthn/verify-registration', authenticateToken, async (req, res) => {
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
                    credentialId: credential.id, // V10 already formats this as a Base64 string!
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

app.post('/api/auth/webauthn/generate-authentication', async (req, res) => {
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

app.post('/api/auth/webauthn/verify-authentication', async (req, res) => {
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
            res.json({ token: jwtToken, message: "Biometrics Verified! Welcome.", role: user.role });
        } else {
            res.status(400).json({ error: "Biometric verification failed." });
        }
    } catch (error) {
        console.error("🚨 AUTH VERIFY ERROR:", error);
        res.status(500).json({ error: "Failed to verify biometrics." });
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
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

app.post('/api/auth/2fa/send-email', authLimiter, async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ error: "User not found" });

        // Generate a random 6-digit code and set expiry to 10 minutes from now
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60000);

        // Fix #3: Hash the OTP before storing — never persist plaintext codes
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

app.post('/api/auth/2fa/generate', authenticateToken, async (req, res) => {
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

app.post('/api/auth/2fa/verify-setup', authenticateToken, async (req, res) => {
    try {
        const { token } = req.body;
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });

        if (!user.twoFactorSecret) return res.status(400).json({ error: "No 2FA setup in progress." });

        // Fix #11: verify() from otplib returns a boolean directly
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

app.post('/api/auth/2fa/validate', async (req, res) => {
    try {
        const { userId, token, method } = req.body;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(400).json({ error: "Invalid request." });

        let isValid = false;

        if (method === 'APP') {
            if (!user.isTwoFactorEnabled) return res.status(400).json({ error: "App 2FA is not enabled." });
            
            const decryptedSecret = decrypt(user.twoFactorSecret);
            
            if (!decryptedSecret) return res.status(500).json({ error: "Security error: Could not read 2FA key." });

            // Fix #11: verify() returns a boolean directly
            isValid = verify({ token, secret: decryptedSecret });

        } else if (method === 'EMAIL') {
            if (!user.emailOtpCode || !user.emailOtpExpiresAt) return res.status(400).json({ error: "No email code requested." });
            if (new Date() > user.emailOtpExpiresAt) return res.status(400).json({ error: "Code expired. Please request a new one." });
            // Fix #3: Compare against the stored hash
            isValid = await bcrypt.compare(token, user.emailOtpCode);
        }

        if (isValid) {
            await prisma.user.update({
                where: { id: user.id },
                data: { emailOtpCode: null, emailOtpExpiresAt: null }
            });

            const jwtToken = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
            res.json({ token: jwtToken, message: "Logged in successfully", role: user.role });
        } else {
            res.status(400).json({ error: "Invalid verification code." });
        }
    } catch (error) {
        console.error("🚨 2FA VALIDATION ERROR:", error);
        res.status(500).json({ error: "Failed to validate code." });
    }
});

app.get('/api/patient/dashboard', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied" });

        const patientData = await prisma.patient.findUnique({
            where: { userId: req.user.id },
            include: {
                user: { select: { isTwoFactorEnabled: true } },
                accessCode: true,
                medicalRecords: {
                    include: { doctor: true },
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        if (!patientData) return res.status(404).json({ error: "Profile not found" });

        if (patientData.accessCode) {
            patientData.accessCode.code = decrypt(patientData.accessCode.code);
        }

        res.json(patientData);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch dashboard" });
    }
});

app.get('/api/doctor/dashboard', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') {
            return res.status(403).json({ error: "Access Denied: Doctor clearance required." });
        }

        const doctorData = await prisma.doctor.findUnique({
            where: { userId: req.user.id },
            include: {
                appointments: {
                    include: { patient: true }
                }
            }
        });

        if (!doctorData) {
            return res.status(404).json({ error: "Doctor profile not found" });
        }

        res.json(doctorData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch doctor dashboard data" });
    }
});

app.post('/api/patient/generate-code', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied." });

        const patient = await prisma.patient.findUnique({ where: { userId: req.user.id } });
        if (!patient) return res.status(404).json({ error: "Patient profile not found." });

        const existingCode = await prisma.accessCode.findUnique({
            where: { patientId: patient.id }
        });

        if (existingCode) {
            if (new Date() < existingCode.expiresAt) {
                // Fix #6: decrypt and return the plaintext code, not the encrypted blob
                const decryptedCode = decrypt(existingCode.code);
                return res.json({ code: decryptedCode, expiresAt: existingCode.expiresAt });
            } else {
                await prisma.accessCode.delete({ where: { id: existingCode.id } });
            }
        }

        const generatePin = () => Math.floor(100000 + Math.random() * 900000).toString();
        let uniqueCode = generatePin();
        let encryptedCode = encrypt(uniqueCode);

        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 60);

        const newCode = await prisma.accessCode.create({
            data: {
                code: encryptedCode,
                expiresAt: expiresAt,
                patientId: patient.id
            }
        });

        res.json({ code: uniqueCode, expiresAt: newCode.expiresAt });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to generate access code" });
    }
});

app.post('/api/doctor/access-vault', authenticateToken, vaultLimiter, async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });

        const { code } = req.body;
        if (!code) return res.status(400).json({ error: "Please enter a 6-digit access code." });

        // Fix #9: Sanitize — reject anything that isn't exactly 6 digits
        if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "Access code must be exactly 6 digits." });

        const activeCodes = await prisma.accessCode.findMany({
            where: { expiresAt: { gt: new Date() } }
        });

        let validCode = null;
        for (const record of activeCodes) {
            const decryptedCode = decrypt(record.code);
            if (decryptedCode === code) {
                validCode = record;
                break;
            }
        }

        if (!validCode) return res.status(404).json({ error: "Invalid code." });

        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        // The socket room is keyed on user.id (from JWT), not the Patient table id
        const patientUser = await prisma.patient.findUnique({
            where: { id: validCode.patientId },
            select: { userId: true }
        });
        if (!patientUser) return res.status(404).json({ error: "Patient not found." });

        io.to(patientUser.userId).emit('auth-request', {
            doctorName: `Dr. ${doctor.lastName}`,
            code: code
        });

        let responded = false;
        const eventName = `auth-resolved-${code}`;

        // Fix #4: Always clean up the listener to prevent memory leaks
        const timeout = setTimeout(() => {
            if (!responded) {
                app.removeAllListeners(eventName);
                res.status(408).json({ error: "Patient did not respond to the approval request." });
            }
        }, 30000);

        app.once(eventName, async (authData) => {
            responded = true;
            clearTimeout(timeout);

            if (authData.approved) {
                const patientData = await prisma.patient.findUnique({
                    where: { id: validCode.patientId },
                    include: {
                        medicalRecords: { include: { doctor: true } }
                    }
                });

                patientData.medicalRecords = patientData.medicalRecords.filter(record =>
                    authData.sharedRecordIds.includes(record.id)
                );

                res.json({ patient: patientData, vaultKey: code });
            } else {
                res.status(403).json({ error: "Access explicitly denied by patient." });
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to access vault." });
    }
});

app.post('/api/doctor/records', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });

        const { patientId, code, diagnosis, treatment, notes } = req.body;

        // Fix #9: Validate and cap field lengths
        if (!diagnosis || typeof diagnosis !== 'string' || diagnosis.trim().length === 0) {
            return res.status(400).json({ error: "Diagnosis is required." });
        }
        if (diagnosis.length > 500) return res.status(400).json({ error: "Diagnosis too long (max 500 chars)." });
        if (treatment && treatment.length > 1000) return res.status(400).json({ error: "Treatment too long (max 1000 chars)." });
        if (notes && notes.length > 2000) return res.status(400).json({ error: "Notes too long (max 2000 chars)." });

        const patientCodes = await prisma.accessCode.findMany({ 
            where: { patientId: patientId } 
        });

        let validCode = null;
        for (const record of patientCodes) {
            if (decrypt(record.code) === code) {
                validCode = record;
                break;
            }
        }

        if (!validCode) {
            return res.status(403).json({ error: "Invalid or expired authorization code." });
        }

        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        const [savedRecord, deletedCode] = await prisma.$transaction([
            prisma.medicalRecord.create({
                data: {
                diagnosis: diagnosis,
                treatment: treatment,
                notes: notes,
                patientId: patientId,
                doctorId: doctor.id
                },   
                include: { doctor: true }
            }),
            prisma.accessCode.delete({ where: { id: validCode.id } })
        ]); 

        try {
            // Look up userId so we emit to the correct socket room
            const patientForSocket = await prisma.patient.findUnique({
                where: { id: validCode.patientId },
                select: { userId: true }
            });
            if (patientForSocket) {
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`🚨 PINGING PATIENT ROOM: ${patientForSocket.userId}`);
                }
                io.to(patientForSocket.userId).emit('vault-updated', { newRecord: savedRecord });
            }
        } catch (socketError) {
            console.error("WEBSOCKET ERROR:", socketError);
        }

        res.json({ message: "Record added successfully and vault locked." });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add record." });
      } 
});

cron.schedule('*/15 * * * *', async () => {
    try {
        console.log("🧹 Sweeping database for expired access codes...");
        const result = await prisma.accessCode.deleteMany({
            where: {
                expiresAt: { lt: new Date() }
            }
        });
        
        if (result.count > 0) {
            console.log(`✅ Deleted ${result.count} expired orphan codes.`);
        }
    } catch (error) {
        console.error("🚨 Garbage collection failed:", error);
    }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 TotalMed Server (HTTP + WebSockets) running on port ${PORT}`);
});