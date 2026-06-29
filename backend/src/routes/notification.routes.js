const express = require('express');
const router = express.Router();

const authenticateToken = require('../middleware/authenticate');
const notifications = require('../services/notification.service');

router.get('/', authenticateToken, async (req, res) => {
    try {
        const list = await notifications.list(req.user.id);
        res.json({ notifications: list });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load notifications." });
    }
});

router.get('/unread-count', authenticateToken, async (req, res) => {
    try {
        const count = await notifications.unreadCount(req.user.id);
        res.json({ count });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load unread count." });
    }
});

router.post('/:id/read', authenticateToken, async (req, res) => {
    try {
        const ok = await notifications.markRead(req.params.id, req.user.id);
        if (!ok) return res.status(404).json({ error: "Notification not found." });
        res.json({ message: "Marked as read." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update notification." });
    }
});

router.post('/read-all', authenticateToken, async (req, res) => {
    try {
        await notifications.markAllRead(req.user.id);
        res.json({ message: "All notifications marked as read." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update notifications." });
    }
});

module.exports = router;
