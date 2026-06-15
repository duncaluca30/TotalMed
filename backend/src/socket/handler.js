const jwt = require('jsonwebtoken');
const cookie = require('cookie');

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

        socket.on('auth-response', (data) => {
            // Emit on the app-level EventEmitter so the doctor's pending HTTP request resolves
            io._expressApp.emit(`auth-resolved-${data.code}`, data);
        });

        socket.on('disconnect', () => {
            if (process.env.NODE_ENV !== 'production') {
                console.log('🔴 User disconnected');
            }
        });
    });
}

module.exports = setupSocketHandlers;
