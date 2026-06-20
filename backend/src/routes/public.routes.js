const express = require('express');
const router = express.Router();

const emergency = require('../services/emergency.service');

// PUBLIC — no authentication. Serves the patient's opt-in Emergency Medical ID
// to whoever holds the unguessable token (a first responder scanning the QR).
// Returns only the minimal safety set, and only when the patient enabled it.
// GET /api/public/emergency/:token
router.get('/emergency/:token', async (req, res) => {
    try {
        const card = await emergency.getPublicCard(req.params.token);
        // Don't reveal whether a token exists but is disabled vs. doesn't exist.
        if (!card) return res.status(404).json({ error: "No emergency card found." });

        // Keep emergency cards out of search engines.
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        res.json(card);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load emergency card." });
    }
});

module.exports = router;
