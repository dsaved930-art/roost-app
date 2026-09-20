const { sendMail } = require('./email');
const { wantsMessageEmails } = require('./notificationPrefs');

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
//
// Respects the recipient's "email me about new messages" setting. The message itself is always
// delivered in-app; only the email is skipped. If recipientId isn't given, or the preference can't
// be read, the email is sent — the same as before this setting existed.
async function sendNewMessageEmail({ recipientId, recipientEmail, recipientName, senderName, listingTitle, messageBody, conversationId }) {
  if (recipientId != null && !(await wantsMessageEmails(recipientId))) return null;

  const preview = truncate(messageBody, 200);
  const link = `${publicUrl()}/?conversation=${conversationId}`;
  const settingsLink = `${publicUrl()}/?account=notifications`;

  return sendMail({
    to: recipientEmail,
    subject: `${senderName} sent you a message on Roost about "${listingTitle}"`,
    text: `Hi ${recipientName},\n\n${senderName} sent you a message about "${listingTitle}" on Roost:\n\n"${preview}"\n\nReply here: ${link}\n\n— Roost\n\nDon't want emails when you get a message? You can turn them off in your account settings: ${settingsLink}`,
    html: `
      <p>Hi ${escHtml(recipientName)},</p>
      <p><strong>${escHtml(senderName)}</strong> sent you a message about <strong>"${escHtml(listingTitle)}"</strong> on Roost:</p>
      <blockquote style="border-left:3px solid #1B74E4;padding-left:12px;color:#444;margin:16px 0;">${escHtml(preview)}</blockquote>
      <p><a href="${link}" style="display:inline-block;background:#1B74E4;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Reply on Roost</a></p>
      <p style="color:#888;font-size:12px;">— Roost</p>
      <p style="color:#888;font-size:12px;">Don't want emails when you get a message? <a href="${settingsLink}" style="color:#888;">Turn them off in your account settings</a>.</p>
    `
  });
}

module.exports = { sendNewMessageEmail };
