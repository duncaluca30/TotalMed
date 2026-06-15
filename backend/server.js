require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');

// Modular imports
const setupSocketHandlers = require('./src/socket/handler');
const startCleanupJob = require('./src/jobs/cleanup');
const authRoutes = require('./src/routes/auth.routes');
const patientRoutes = require('./src/routes/patient.routes');
const doctorRoutes = require('./src/routes/doctor.routes');
const prisma = require('./src/config/prisma');

const app = express();
const server = http.createServer(app);

const ALLOWED_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';

const io = new Server(server, {
    cors: { origin: ALLOWED_ORIGIN, methods: ["GET", "POST"] },
    pingInterval: 25000,
    pingTimeout: 60000
});

// Store app reference on io so socket handler can emit auth-resolved events
io._expressApp = app;

// Socket.IO
setupSocketHandlers(io);

// Express middleware
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.set('trust proxy', 1);
app.use(express.json());
app.use(helmet());

// Inject io into every request so route handlers can emit socket events
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Health check
app.get('/api/status', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1 + 1`;
        res.json({ message: "Medical App API is running securely!", database: "Connected successfully to Neon Postgres!" });
    } catch (error) {
        res.status(500).json({ error: "Database connection failed" });
    }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/doctor', doctorRoutes);

// Background jobs
startCleanupJob();

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 TotalMed Server (HTTP + WebSockets) running on port ${PORT}`);
});