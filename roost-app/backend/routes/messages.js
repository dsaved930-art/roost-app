const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendNewMessageEmail } = require('../utils/messageNotify');
const { containsUrl } = require('../utils/linkDetection');

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
         SELECT (
           (SELECT COUNT(*) FROM messages
            WHERE conversation_id = c.id AND sender_id != $1 AND read_at IS NULL)
           +
           (SELECT COUNT(*) FROM message_reactions r JOIN messages rm ON rm.id = r.message_id
            WHERE rm.conversation_id = c.id AND r.user_id != $1 AND r.seen_at IS NULL)
         )::int AS count
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
      `SELECT (
         (SELECT COUNT(*) FROM messages m
          JOIN conversations c ON c.id = m.conversation_id
          WHERE (c.buyer_id = $1 OR c.seller_id = $1) AND m.sender_id != $1 AND m.read_at IS NULL)
         +
         (SELECT COUNT(*) FROM message_reactions r
          JOIN messages rm ON rm.id = r.message_id
          JOIN conversations rc ON rc.id = rm.conversation_id
          WHERE (rc.buyer_id = $1 OR rc.seller_id = $1) AND r.user_id != $1 AND r.seen_at IS NULL)
       )::int AS count`,
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

    // Reactions are a nice-to-have; the conversation itself must still load if this lookup ever fails
    // (for example, the reactions table hasn't been created yet), so it fails soft.
    const reactionsByMessage = {};
    try {
      const reactionRows = await pool.query(
        `SELECT r.message_id AS "messageId", r.user_id AS "userId", r.emoji
         FROM message_reactions r JOIN messages m ON m.id = r.message_id
         WHERE m.conversation_id = $1 ORDER BY r.created_at ASC`,
        [req.params.id]
      );
      reactionRows.rows.forEach(r => {
        (reactionsByMessage[r.messageId] = reactionsByMessage[r.messageId] || []).push({ userId: r.userId, emoji: r.emoji });
      });
    } catch (e) {
      console.error('Could not load message reactions:', e.message);
    }
    const messagesWithReactions = messages.rows.map(m => ({ ...m, reactions: reactionsByMessage[m.id] || [] }));

    await pool.query(
      `UPDATE messages SET read_at = now()
       WHERE conversation_id = $1 AND sender_id != $2 AND read_at IS NULL`,
      [req.params.id, req.user.id]
    );
    try {
      await pool.query(
        `UPDATE message_reactions SET seen_at = now()
         WHERE seen_at IS NULL AND user_id != $2
           AND message_id IN (SELECT id FROM messages WHERE conversation_id = $1)`,
        [req.params.id, req.user.id]
      );
    } catch (e) {
      console.error('Could not mark reactions seen:', e.message);
    }

    const listingResult = await pool.query('SELECT id, title, photo_thumb AS "photoUrl", sold_to_user_id AS "soldToUserId" FROM listings WHERE id = $1', [conv.listing_id]);
    const listing = listingResult.rows[0] || null;

    const isBuyer = conv.buyer_id === req.user.id;
    let alreadyReviewed = false;
    if (isBuyer) {
      const reviewCheck = await pool.query(
        'SELECT id FROM reviews WHERE listing_id = $1 AND reviewer_id = $2',
        [conv.listing_id, req.user.id]
      );
      alreadyReviewed = reviewCheck.rows.length > 0;
    }
    // Only reviewable once the seller has marked THIS buyer as who they sold
    // it to (see the reviews route in listings.js for the real enforcement —
    // this flag just controls whether the button shows up at all).
    const isConfirmedBuyer = !!(listing && listing.soldToUserId === req.user.id);

    res.json({
      conversation: {
        id: conv.id,
        listing: listing ? { id: listing.id, title: listing.title, photoUrl: listing.photoUrl } : null,
        buyerId: conv.buyer_id,
        sellerId: conv.seller_id,
        canReview: isBuyer && isConfirmedBuyer && !alreadyReviewed,
        alreadyReviewed
      },
      messages: messagesWithReactions
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
    if (containsUrl(body)) return res.status(400).json({ error: 'Links aren\'t allowed in messages — this is to help keep everyone safe from off-platform scams.' });

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
        recipientId,
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

// The only reactions allowed. A fixed list (no free text) means a reaction can never carry a link or
// scam wording, which keeps it consistent with the no-links rule on regular messages.
const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '😮', '🙏'];

// React to a message, change your reaction, or remove it by sending the same emoji again.
// Deliberately sends no email — reactions only show up in the thread and as a quiet unread badge.
router.post('/:id/messages/:messageId/reaction', requireAuth, async (req, res) => {
  try {
    const conv = await assertParticipant(req.params.id, req.user.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found.' });

    const messageId = parseInt(req.params.messageId, 10);
    if (!Number.isInteger(messageId)) return res.status(404).json({ error: 'Message not found.' });
    const msg = await pool.query('SELECT id FROM messages WHERE id = $1 AND conversation_id = $2', [messageId, conv.id]);
    if (msg.rows.length === 0) return res.status(404).json({ error: 'Message not found.' });

    const emoji = req.body && req.body.emoji;
    if (!ALLOWED_REACTIONS.includes(emoji)) return res.status(400).json({ error: 'That reaction is not available.' });

    const existing = await pool.query('SELECT emoji FROM message_reactions WHERE message_id = $1 AND user_id = $2', [messageId, req.user.id]);
    if (existing.rows.length > 0 && existing.rows[0].emoji === emoji) {
      await pool.query('DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2', [messageId, req.user.id]);
    } else {
      await pool.query(
        `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)
         ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now(), seen_at = NULL`,
        [messageId, req.user.id, emoji]
      );
    }

    const reactions = await pool.query(
      'SELECT user_id AS "userId", emoji FROM message_reactions WHERE message_id = $1 ORDER BY created_at ASC',
      [messageId]
    );
    res.json({ reactions: reactions.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not save that reaction.' });
  }
});

module.exports = router;
