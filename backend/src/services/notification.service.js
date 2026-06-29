const prisma = require('../config/prisma');

async function create(userId, type, title, body) {
    try {
        return await prisma.notification.create({
            data: { userId, type, title, body }
        });
    } catch (e) {
        console.error('Failed to create notification:', e);
        return null;
    }
}

function list(userId, limit = 30) {
    return prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit
    });
}

function unreadCount(userId) {
    return prisma.notification.count({ where: { userId, read: false } });
}

async function markRead(id, userId) {
    const result = await prisma.notification.updateMany({
        where: { id, userId },
        data: { read: true }
    });
    return result.count > 0;
}

function markAllRead(userId) {
    return prisma.notification.updateMany({
        where: { userId, read: false },
        data: { read: true }
    });
}

module.exports = { create, list, unreadCount, markRead, markAllRead };
