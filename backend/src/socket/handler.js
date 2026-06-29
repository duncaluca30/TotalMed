const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const prisma = require('../config/prisma');
const { lookupAccessCode } = require('../services/vault.service');

function setupSocketHandlers(io) {

    io.use((socket, next) => {
        const cookies = cookie.parse(socket.handshake.headers.cookie || '');
        const token = cookies.token;
        if (!token) return next(new Error('Authentication error'));
        
        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) return next(new Error('Authentication error'));
            socket.user = decoded;
            next();
        });
    });

    io.on('connection', (socket) => {
        if (process.env.NODE_ENV !== 'production') {
            console.log('🟢 User connected to switchboard:', socket.id);
        }

        if (socket.user?.role === 'DOCTOR') {
            socket.join(socket.user.id.toString());
        }

        socket.on('join-secure-room', async () => {
            try {
                if (socket.user.role !== 'PATIENT') return;
                const roomName = socket.user.id.toString();

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

        socket.on('auth-response', async (data) => {

            try {
                if (!socket.user || socket.user.role !== 'PATIENT') return;
                if (!data || typeof data.code !== 'string') return;

                const accessCode = await lookupAccessCode(data.code);
                if (!accessCode) return;

                const patient = await prisma.patient.findUnique({
                    where: { id: accessCode.patientId },
                    select: { userId: true }
                });
                if (!patient || patient.userId !== socket.user.id) return;

                io._expressApp.emit(`auth-resolved-${data.code}`, data);
            } catch (err) {
                console.error('🚨 auth-response handling failed:', err);
            }
        });

        socket.on('disconnect', () => {
            if (process.env.NODE_ENV !== 'production') {
                console.log('🔴 User disconnected');
            }
        });
    });
}

module.exports = setupSocketHandlers;
