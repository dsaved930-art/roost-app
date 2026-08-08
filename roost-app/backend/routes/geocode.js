const express = require('express');
const router = express.Router();
const { geocodeCityState } = require('../utils/geocode');

// Public — no auth needed. Just proxies to the Census geocoder so the
// browser doesn't have to call a third-party API directly (avoids CORS
// issues and keeps this centralized in one place).
router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Missing location query.' });

    // Accept "City, State" or "City State" — split on the last comma if present.
    let city = q;
    let state = '';
    if (q.includes(',')) {
      const parts = q.split(',');
      state = parts.pop().trim();
      city = parts.join(',').trim();
    } else {
      const words = q.trim().split(/\s+/);
      if (words.length > 1) {
        state = words.pop();
        city = words.join(' ');
      }
    }

    const coords = await geocodeCityState(city, state);
    if (!coords) return res.status(404).json({ error: 'Could not find that location.' });
    res.json(coords);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not geocode that location.' });
  }
});

module.exports = router;
