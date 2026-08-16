const { sendMail } = require('./email');

function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function truncate(text, max) {
  const t = String(text || '');
  return t.length <= max ? t : t.slice(0, max).trim() + '…';
}
function publicUrl() {
  return (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
}

// Fires whenever a message is sent, whether that's someone starting a new
// conversation or replying within one — notifies whichever party did NOT
// send it. This is the difference between "feels like a real, responsive
// marketplace" and "buyer messages, seller never notices, sale is lost."
async function sendNewMessageEmail({ recipientEmail, recipientName, senderName, listingTitle, messageBody, conversationId }) {
  const preview = truncate(messageBody, 200);
  const link = `${publicUrl()}/?conversation=${conversationId}`;

  return sendMail({
    to: recipientEmail,
    subject: `${senderName} sent you a message about "${listingTitle}"`,
    text: `Hi ${recipientName},\n\n${senderName} sent you a message about "${listingTitle}" on Roost:\n\n"${preview}"\n\nReply here: ${link}\n\n— Roost`,
    html: `
      <p>Hi ${escHtml(recipientName)},</p>
      <p><strong>${escHtml(senderName)}</strong> sent you a message about <strong>"${escHtml(listingTitle)}"</strong> on Roost:</p>
      <blockquote style="border-left:3px solid #1B74E4;padding-left:12px;color:#444;margin:16px 0;">${escHtml(preview)}</blockquote>
      <p><a href="${link}" style="display:inline-block;background:#1B74E4;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Reply on Roost</a></p>
      <p style="color:#888;font-size:12px;">— Roost</p>
    `
  });
}

module.exports = { sendNewMessageEmail };
