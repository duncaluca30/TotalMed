require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

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
app.use(cors());
app.use(express.json());

// --- SECURITY GUARD (JWT Middleware) ---
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

// --- 1. SYSTEM STATUS ROUTE ---
app.get('/api/status', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1 + 1`;
        res.json({ message: "Medical App API is running securely!", database: "Connected successfully to Neon Postgres!" });
    } catch (error) {
        res.status(500).json({ error: "Database connection failed" });
    }
});

// --- 2. REGISTER A NEW PATIENT ---
app.post('/api/auth/register', async (req, res) => {
    try {
        // Grab the data the user typed into the frontend
        const { email, password, firstName, lastName, dateOfBirth, phone } = req.body;

        // Check if the email is already taken
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: "Email is already registered" });
        }

        // Hash (encrypt) the password 10 times
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Save the new User AND their Patient Profile to Neon
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

// --- 3. LOGIN ROUTE ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find the user in the database
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(400).json({ error: "Invalid email or password" });
        }

        // Compare the typed password with the encrypted database password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Invalid email or password" });
        }

        // Create the JWT "VIP Pass" (Valid for 1 day)
        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        // Send the token back to the frontend
        res.json({ token, message: "Logged in successfully", role: user.role });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Login failed" });
    }
});

// --- 4. SECURE PATIENT DASHBOARD ---
app.get('/api/patient/dashboard', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'PATIENT') return res.status(403).json({ error: "Access Denied" });

        const patientData = await prisma.patient.findUnique({
            where: { userId: req.user.id },
            include: {
                accessCode: true, // Gets the active vault key if she has one
                medicalRecords: { // 👈 Fetch the actual history!
                    include: { doctor: true }, // Include the doctor's name who wrote it
                    orderBy: { createdAt: 'desc' } // Newest records at the top
                }
            }
        });

        if (!patientData) return res.status(404).json({ error: "Profile not found" });
        res.json(patientData);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch dashboard" });
    }
});

// --- 5. PROTECTED DOCTOR DASHBOARD ROUTE ---
app.get('/api/doctor/dashboard', authenticateToken, async (req, res) => {
    try {
        // Security Check: Is this VIP pass actually for a Doctor?
        if (req.user.role !== 'DOCTOR') {
            return res.status(403).json({ error: "Access Denied: Doctor clearance required." });
        }

        // Ask Prisma for the Doctor Profile AND their Appointments (with Patient details)
        const doctorData = await prisma.doctor.findUnique({
            where: { userId: req.user.id },
            include: {
                appointments: {
                    include: { patient: true } // We need the patient's name for the schedule!
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

// --- 7. PATIENT: SMART GENERATE ACCESS CODE ---
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
                return res.json({ code: existingCode.code, expiresAt: existingCode.expiresAt });
            } else {
                await prisma.accessCode.delete({ where: { id: existingCode.id } });
            }
        }

        const generatePin = () => Math.floor(100000 + Math.random() * 900000).toString();
        let uniqueCode = generatePin();

        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 60);

        const newCode = await prisma.accessCode.create({
            data: { code: uniqueCode, expiresAt: expiresAt, patientId: patient.id }
        });

        res.json({ code: newCode.code, expiresAt: newCode.expiresAt });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to generate access code" });
    }
});

// --- 8. DOCTOR: UNLOCK PATIENT VAULT VIA CODE ---
app.post('/api/doctor/access-vault', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied. Doctor clearance required." });

        const { code } = req.body;
        if (!code) return res.status(400).json({ error: "Please enter a 6-digit access code." });

        // 1. Find the code in the database
        const validCode = await prisma.accessCode.findUnique({
            where: { code: code }
        });

        // 2. Security Checks
        if (!validCode) return res.status(404).json({ error: "Invalid code. Please check the number." });
        
        if (new Date() > validCode.expiresAt) {
            await prisma.accessCode.delete({ where: { id: validCode.id } }); // Clean it up
            return res.status(403).json({ error: "This code has expired. Patient must generate a new one." });
        }

        // 3. Code is valid! Fetch the patient's basic profile
        const patientData = await prisma.patient.findUnique({
            where: { id: validCode.patientId }
        });

        res.json({ patient: patientData, vaultKey: validCode.code });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to access vault." });
    }
});

// --- 9. DOCTOR: INJECT RECORD & BURN CODE ---
app.post('/api/doctor/records', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: "Access Denied." });

        const { patientId, code, diagnosis, treatment, notes } = req.body;

        // 1. Final Security Check: Is the code STILL valid right this second?
        const validCode = await prisma.accessCode.findUnique({ where: { code: code } });
        if (!validCode || validCode.patientId !== patientId) {
            return res.status(403).json({ error: "Invalid or expired authorization code." });
        }

        // 2. Find the Doctor's internal database ID
        const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });

        // 3. THE TRANSACTION: Create Record & Burn the Code
        await prisma.$transaction([
            // Action A: Inject the permanent medical record
            prisma.medicalRecord.create({
                data: {
                    diagnosis: diagnosis,
                    treatment: treatment,
                    notes: notes,
                    patientId: patientId,
                    doctorId: doctor.id
                }
            }),
            // Action B: THE BURN 🔥 (Permanently delete the key)
            prisma.accessCode.delete({ where: { id: validCode.id } }) 
        ]);

        res.json({ message: "Medical record injected and vault securely locked!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to save record." });
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

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
});