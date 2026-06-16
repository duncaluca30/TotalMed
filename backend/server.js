require('dotenv').config();
const createServer = require('./src/app');
const startCleanupJob = require('./src/jobs/cleanup');

// Safety net: a stray rejection (e.g. from an async event listener that runs
// outside any try/catch) must never take the whole server down and disconnect
// every connected user. Log it loudly instead of crashing.
process.on('unhandledRejection', (reason) => {
    console.error('🚨 UNHANDLED REJECTION (server kept alive):', reason);
});

const { server } = createServer();

// Background jobs
startCleanupJob();

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 TotalMed Server (HTTP + WebSockets) running on port ${PORT}`);
});
