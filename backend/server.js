require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');

// Modular imports
const setupSocketHandlers = require('./src/socket/handler');
const startCleanupJob = require('./src/jobs/cleanup');
const authRoutes = require('./src/routes/auth.routes');
const patientRoutes = require('./src/routes/patient.routes');
const doctorRoutes = require('./src/routes/doctor.routes');
const prisma = require('./src/config/prisma');
const { csrfProtection } = require('./src/middleware/csrf');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
    process.env.FRONTEND_URL, 
    'http://localhost:5173',
    'https://totalmed-backend.onrender.com'
].filter(Boolean);

const io = new Server(server, {
    cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
    pingInterval: 25000,
    pingTimeout: 60000
});

// Store app reference on io so socket handler can emit auth-resolved events
io._expressApp = app;

// Socket.IO
setupSocketHandlers(io);

// Express middleware
app.use(cors({ 
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }, 
    credentials: true 
}));
app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(helmet());

// Inject io into every request so route handlers can emit socket events
app.use((req, res, next) => {
    req.io = io;
    next();
});

// CSRF protection (double-submit cookie pattern)
app.use(csrfProtection);

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

// --- SERVE FRONTEND IN PRODUCTION ---
if (process.env.NODE_ENV === 'production') {
    const frontendDistPath = path.join(__dirname, '../frontend/dist');
    app.use(express.static(frontendDistPath));

    // Catch-all route to serve index.html for React Router
    app.use((req, res, next) => {
        if (req.method === 'GET' && !req.path.startsWith('/api')) {
            res.sendFile(path.join(frontendDistPath, 'index.html'));
        } else {
            next();
        }
    });
}

// Background jobs
startCleanupJob();

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 TotalMed Server (HTTP + WebSockets) running on port ${PORT}`);
});