const express = require('express');
const router = express.Router();
const pool = require('../db');

// Public — anyone can view a seller's profile and reviews, signed in or not.
// This is a trust signal meant to be seen before deciding to message someone.
router.get('/:id/profile', async (req, res) => {
  try {
    const userResult = await pool.query('SELECT id, name, created_at, verification_status FROM users WHERE id = $1', [req.params.id]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    const user = userResult.rows[0];

    const ratingResult = await pool.query(
      'SELECT COUNT(*)::int AS count, COALESCE(AVG(rating), 0)::float AS avg FROM reviews WHERE seller_id = $1',
      [user.id]
    );

    const reviewsResult = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.created_at AS "createdAt", u.name AS "reviewerName", l.title AS "listingTitle"
       FROM reviews r
       JOIN users u ON u.id = r.reviewer_id
       JOIN listings l ON l.id = r.listing_id
       WHERE r.seller_id = $1
       ORDER BY r.created_at DESC
       LIMIT 50`,
      [user.id]
    );

    const listingsResult = await pool.query(
      `SELECT id, title, category, breed, free, price, city, state, photo_thumb AS "photoUrl", created_at AS "createdAt"
       FROM listings WHERE posted_by = $1 ORDER BY created_at DESC LIMIT 12`,
      [user.id]
    );

    res.json({
      user: {
        id: user.id,
        name: user.name,
        memberSince: user.created_at,
        verified: user.verification_status === 'verified',
        avgRating: Math.round(ratingResult.rows[0].avg * 10) / 10,
        reviewCount: ratingResult.rows[0].count
      },
      reviews: reviewsResult.rows,
      listings: listingsResult.rows
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load this profile.' });
  }
});

module.exports = router;
