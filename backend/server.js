require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cron = require('node-cron');
const { encrypt, decrypt } = require('./utils/cipher');

// Security Packages
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Prisma 7 Adapter Setup
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: '*', methods: ["GET", "POST"] },
    pingInterval: 25000,
    pingTimeout: 60000
});

io.on('connection', (socket) => {
    console.log('🟢 User connected to switchboard:', socket.id);

    socket.on('join-secure-room', (patientId) => {
        const roomName = patientId.toString();
        socket.join(roomName);
        console.log(`🔒 Patient secured their connection in room: ${roomName}`);
    });

    socket.on('auth-response', (data) => {
        app.emit(`auth-resolved-${data.code}`, data);
    });

    socket.on('disconnect', () => {
        console.log('🔴 User disconnected');
    });
});

app.use(cors());
app.use(express.json());

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
            const today = new Date();
            if (dob > today) {
                return res.status(400).json({ error: "Date of birth cannot be in the future." });
            }
        }

        const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({ 
                error: "Password must be at least 8 characters long and include a letter, a number, and a special character." 
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

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(400).json({ error: "Invalid email or password" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Invalid email or password" });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ token, message: "Logged in successfully", role: user.role });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Login failed" });
    }
});

app.get('/api/patient/dashboard', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied" });

        const patientData = await prisma.patient.findUnique({
            where: { userId: req.user.id },
            include: {
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
                const decryptedCode = decrypt(existingCode.code);
                return res.json({ code: existingCode.code, expiresAt: existingCode.expiresAt });
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

app.post('/api/doctor/access-vault', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });

        const { code } = req.body;
        if (!code) return res.status(400).json({ error: "Please enter a 6-digit access code." });

        const encryptedSearch = encrypt(code);
        const validCode = await prisma.accessCode.findUnique({ where: { code: encryptedSearch } });
        
        if (!validCode) return res.status(404).json({ error: "Invalid code." });
        if (new Date() > validCode.expiresAt) return res.status(403).json({ error: "Code expired." });

        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        io.to(validCode.patientId).emit('auth-request', { 
            doctorName: `Dr. ${doctor.lastName}`, 
            code: code 
        });

        let responded = false;

        const timeout = setTimeout(() => {
            if (!responded) res.status(408).json({ error: "Patient did not respond to the approval request." });
        }, 30000);

        app.once(`auth-resolved-${code}`, async (authData) => {
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

        const encryptedSearch = encrypt(code);

        const validCode = await prisma.accessCode.findUnique({ where: { code: encryptedSearch } });
        if (!validCode || validCode.patientId !== patientId) {
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
        const targetRoom = validCode.patientId.toString();
        console.log(`🚨 PINGING PATIENT ROOM: ${targetRoom}`);

        io.to(targetRoom).emit('vault-updated', { newRecord: savedRecord });
      
        } catch (socketError) {
            console.error("🚨 WEBSOCKET ERROR:", socketError);
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