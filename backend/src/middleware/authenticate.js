const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const authenticateToken = async (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: "Access Denied. No token provided." });
    }

    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        return res.status(403).json({ error: "Access Denied: Invalid Token" });
    }

    try {
        // The token is cryptographically valid, but also confirm the account still
        // exists (handles deleted accounts) and the token wasn't issued before the
        // account's last session reset (handles password reset/change → logout).
        const user = await prisma.user.findUnique({
            where: { id: payload.id },
            select: { id: true, sessionValidAfter: true }
        });

        if (!user) {
            return res.status(401).json({ error: "Account no longer exists." });
        }

        // jwt `iat` is in whole seconds (floored), so compare the cutoff at the
        // same second granularity — otherwise a token re-issued in the same second
        // as the cutoff (e.g. right after change-password) would be wrongly rejected.
        if (user.sessionValidAfter && payload.iat < Math.floor(user.sessionValidAfter.getTime() / 1000)) {
            return res.status(403).json({ error: "Session expired. Please log in again." });
        }

        req.user = payload;
        next();
    } catch (err) {
        console.error("Auth middleware error:", err);
        return res.status(500).json({ error: "Authentication check failed." });
    }
};

module.exports = authenticateToken;
