require('dotenv').config();
const express = require('express');
const cors = require('cors');

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

// --- 4. PROTECTED PATIENT DASHBOARD ROUTE ---
app.get('/api/patient/dashboard', authenticateToken, async (req, res) => {
    try {
        const patientData = await prisma.patient.findUnique({
            where: { userId: req.user.id },
            include: {
                appointments: {
                    include: { doctor: true }
                }
            }
        });

        if (!patientData) {
            return res.status(404).json({ error: "Patient profile not found" });
        }

        res.json(patientData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
});