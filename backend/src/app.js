require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');

const setupSocketHandlers = require('./socket/handler');
const authRoutes = require('./routes/auth.routes');
const patientRoutes = require('./routes/patient.routes');
const doctorRoutes = require('./routes/doctor.routes');
const adminRoutes = require('./routes/admin.routes');
const notificationRoutes = require('./routes/notification.routes');
const publicRoutes = require('./routes/public.routes');
const prisma = require('./config/prisma');
const { csrfProtection } = require('./middleware/csrf');

function createServer() {
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

    io._expressApp = app;
    setupSocketHandlers(io);

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

    app.use((req, res, next) => {
        req.io = io;
        next();
    });

    app.use(csrfProtection);

    app.get('/api/status', async (req, res) => {
        try {
            await prisma.$queryRaw`SELECT 1 + 1`;
            res.json({ message: "Medical App API is running securely!", database: "Connected successfully to Neon Postgres!" });
        } catch (error) {
            res.status(500).json({ error: "Database connection failed" });
        }
    });

    app.use('/api/public', publicRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/patient', patientRoutes);
    app.use('/api/doctor', doctorRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/notifications', notificationRoutes);

    if (process.env.NODE_ENV === 'production') {
        const frontendDistPath = path.join(__dirname, '../../frontend/dist');
        app.use(express.static(frontendDistPath));

        app.use((req, res, next) => {
            if (req.method === 'GET' && !req.path.startsWith('/api')) {
                res.sendFile(path.join(frontendDistPath, 'index.html'));
            } else {
                next();
            }
        });
    }

    return { app, server, io };
}

module.exports = createServer;
