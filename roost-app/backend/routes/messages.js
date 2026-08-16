const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendNewMessageEmail } = require('../utils/messageNotify');

// List all conversations the current user is part of (as buyer or seller),
// newest activity first, with an unread count for the badge in the header.
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         c.id,
         c.listing_id AS "listingId",
         l.title AS "listingTitle",
         l.photo_thumb AS "listingPhoto",
         CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END AS "otherUserId",
         CASE WHEN c.buyer_id = $1 THEN sellerUser.name ELSE buyerUser.name END AS "otherUserName",
         lastMsg.body AS "lastMessage",
         lastMsg.created_at AS "lastMessageAt",
         lastMsg.sender_id AS "lastMessageSenderId",
         COALESCE(unread.count, 0)::int AS "unreadCount"
       FROM conversations c
       JOIN listings l ON l.id = c.listing_id
       JOIN users buyerUser ON buyerUser.id = c.buyer_id
       JOIN users sellerUser ON sellerUser.id = c.seller_id
       LEFT JOIN LATERAL (
         SELECT body, created_at, sender_id FROM messages
         WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
       ) lastMsg ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS count FROM messages
         WHERE conversation_id = c.id AND sender_id != $1 AND read_at IS NULL
       ) unread ON true
       WHERE c.buyer_id = $1 OR c.seller_id = $1
       ORDER BY COALESCE(lastMsg.created_at, c.created_at) DESC`,
      [req.user.id]
    );
    res.json({ conversations: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load your messages.' });
  }
});

// Total unread count only — used for the small badge on the "Messages" tab
// without pulling the whole inbox every time.
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE (c.buyer_id = $1 OR c.seller_id = $1) AND m.sender_id != $1 AND m.read_at IS NULL`,
      [req.user.id]
    );
    res.json({ count: result.rows[0].count });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load unread count.' });
  }
});

async function assertParticipant(conversationId, userId) {
  const result = await pool.query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
  if (result.rows.length === 0) return null;
  const c = result.rows[0];
  if (c.buyer_id !== userId && c.seller_id !== userId) return null;
  return c;
}

// Full thread for one conversation. Marks the other person's messages as read.
router.get('/:id/messages', requireAuth, async (req, res) => {
  try {
    const conv = await assertParticipant(req.params.id, req.user.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found.' });

    const messages = await pool.query(
      `SELECT m.id, m.sender_id AS "senderId", u.name AS "senderName", m.body, m.created_at AS "createdAt"
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1 ORDER BY m.created_at ASC`,
      [req.params.id]
    );

    await pool.query(
      `UPDATE messages SET read_at = now()
       WHERE conversation_id = $1 AND sender_id != $2 AND read_at IS NULL`,
      [req.params.id, req.user.id]
    );

    const listingResult = await pool.query('SELECT id, title, photo_thumb AS "photoUrl" FROM listings WHERE id = $1', [conv.listing_id]);

    const isBuyer = conv.buyer_id === req.user.id;
    let alreadyReviewed = false;
    if (isBuyer) {
      const reviewCheck = await pool.query(
        'SELECT id FROM reviews WHERE listing_id = $1 AND reviewer_id = $2',
        [conv.listing_id, req.user.id]
      );
      alreadyReviewed = reviewCheck.rows.length > 0;
    }

    res.json({
      conversation: {
        id: conv.id,
        listing: listingResult.rows[0] || null,
        buyerId: conv.buyer_id,
        sellerId: conv.seller_id,
        canReview: isBuyer && !alreadyReviewed,
        alreadyReviewed
      },
      messages: messages.rows
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load that conversation.' });
  }
});

// Reply within an existing conversation.
router.post('/:id/messages', requireAuth, async (req, res) => {
  try {
    const conv = await assertParticipant(req.params.id, req.user.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found.' });

    const body = String((req.body && req.body.body) || '').trim();
    if (!body) return res.status(400).json({ error: 'Message cannot be empty.' });
    if (body.length > 2000) return res.status(400).json({ error: 'Message is too long.' });

    const inserted = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, $3)
       RETURNING id, sender_id AS "senderId", body, created_at AS "createdAt"`,
      [req.params.id, req.user.id, body]
    );
    res.json({ message: inserted.rows[0] });

    // Notify whichever side didn't send this reply — same fire-and-forget
    // pattern as starting a conversation, never blocks the response.
    const recipientId = conv.buyer_id === req.user.id ? conv.seller_id : conv.buyer_id;
    Promise.all([
      pool.query('SELECT name, email FROM users WHERE id = $1', [recipientId]),
      pool.query('SELECT title FROM listings WHERE id = $1', [conv.listing_id])
    ]).then(([recipientResult, listingResult]) => {
      const recipient = recipientResult.rows[0];
      const listing = listingResult.rows[0];
      if (!recipient || !listing) return;
      return sendNewMessageEmail({
        recipientEmail: recipient.email, recipientName: recipient.name,
        senderName: req.user.name, listingTitle: listing.title,
        messageBody: body, conversationId: req.params.id
      });
    }).catch(err => console.error('New-message email failed:', err));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not send that message.' });
  }
});

module.exports = router;
