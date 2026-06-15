const cron = require('node-cron');
const prisma = require('../config/prisma');

function startCleanupJob() {
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
}

module.exports = startCleanupJob;
