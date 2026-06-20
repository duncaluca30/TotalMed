const prisma = require('../config/prisma');

/**
 * Persist an in-app notification for a user. Returns the created row so the
 * caller can also push it over Socket.IO for real-time delivery. Never throws
 * to the caller — a failed notification must not break the action that triggered
 * it (adding a record, an emergency access, a login).
 */
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

/** Most recent notifications for a user. */
function list(userId, limit = 30) {
    return prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit
    });
}

/** Count of unread notifications for a user. */
function unreadCount(userId) {
    return prisma.notification.count({ where: { userId, read: false } });
}

/** Mark a single notification read, scoped to its owner. Returns true if updated. */
async function markRead(id, userId) {
    const result = await prisma.notification.updateMany({
        where: { id, userId },
        data: { read: true }
    });
    return result.count > 0;
}

/** Mark all of a user's notifications read. */
function markAllRead(userId) {
    return prisma.notification.updateMany({
        where: { userId, read: false },
        data: { read: true }
    });
}

module.exports = { create, list, unreadCount, markRead, markAllRead };
