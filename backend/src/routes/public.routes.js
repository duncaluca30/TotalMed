const express = require('express');
const router = express.Router();

const emergency = require('../services/emergency.service');

router.get('/emergency/:token', async (req, res) => {
    try {
        const card = await emergency.getPublicCard(req.params.token);

        if (!card) return res.status(404).json({ error: "No emergency card found." });

        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        res.json(card);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load emergency card." });
    }
});

module.exports = router;
