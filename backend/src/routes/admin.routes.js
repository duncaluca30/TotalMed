const express = require('express');
const router = express.Router();

const prisma = require('../config/prisma');
const authenticateToken = require('../middleware/authenticate');

// Every route here requires ADMIN clearance.
function requireAdmin(req, res, next) {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: "Access Denied: Administrator clearance required." });
    }
    next();
}

// GET /api/admin/stats — high-level counts for the dashboard.
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [users, patients, doctors, records, emergencies, attachments] = await Promise.all([
            prisma.user.count(),
            prisma.patient.count(),
            prisma.doctor.count(),
            prisma.medicalRecord.count(),
            prisma.emergencyAccess.count(),
            prisma.attachment.count()
        ]);
        res.json({ users, patients, doctors, records, emergencies, attachments });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load stats." });
    }
});

// GET /api/admin/audit-logs?page=&limit= — the full audit trail, acting user's
// email resolved for readability.
router.get('/audit-logs', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 25, 100);
        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, skip, take: limit }),
            prisma.auditLog.count()
        ]);

        const userIds = [...new Set(logs.map(l => l.userId))];
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, email: true, role: true }
        });
        const byId = new Map(users.map(u => [u.id, u]));

        res.json({
            logs: logs.map(l => ({
                id: l.id,
                action: l.action,
                actorEmail: byId.get(l.userId)?.email || 'Unknown',
                actorRole: byId.get(l.userId)?.role || null,
                details: l.details,
                ipAddress: l.ipAddress,
                createdAt: l.createdAt
            })),
            pagination: { page, limit, total, hasMore: skip + limit < total }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load audit logs." });
    }
});

// GET /api/admin/emergency-access — every break-the-glass access, with the
// doctor and patient resolved to names.
router.get('/emergency-access', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const rows = await prisma.emergencyAccess.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                doctor: { select: { firstName: true, lastName: true, specialty: true } },
                patient: { select: { firstName: true, lastName: true } }
            }
        });

        res.json({
            accesses: rows.map(r => ({
                id: r.id,
                reason: r.reason,
                doctor: `Dr. ${r.doctor.firstName} ${r.doctor.lastName}`,
                specialty: r.doctor.specialty,
                patient: `${r.patient.firstName} ${r.patient.lastName}`,
                notifiedAt: r.notifiedAt,
                createdAt: r.createdAt
            }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load emergency-access log." });
    }
});

module.exports = router;
