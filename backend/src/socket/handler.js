const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const prisma = require('../config/prisma');
const { lookupAccessCode } = require('../services/vault.service');

function setupSocketHandlers(io) {
    // Middleware to authenticate socket connections via httpOnly cookie
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

        // Doctors join a room keyed by their own user id so the server can push
        // targeted events to them (e.g. "the patient just revoked your access").
        // Patients use the dedicated join-secure-room handler below instead.
        if (socket.user?.role === 'DOCTOR') {
            socket.join(socket.user.id.toString());
        }

        socket.on('join-secure-room', async () => {
            try {
                if (socket.user.role !== 'PATIENT') return;
                const roomName = socket.user.id.toString();

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

        socket.on('auth-response', async (data) => {
            // SECURITY: an approval is only valid if it comes from the PATIENT who
            // actually owns the access code. Without this check, any authenticated
            // socket (including the requesting doctor) could forge an approval and
            // bypass patient consent entirely.
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

                // Verified: this socket belongs to the patient who owns the code.
                // Emit on the app-level EventEmitter so the doctor's pending HTTP request resolves.
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
