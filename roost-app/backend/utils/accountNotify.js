const { sendMail } = require('./email');

function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// Security emails. If someone else gets into an account, the owner finding out by email is often
// the only way they'll ever know. Both are sent after the change has already happened and never
// block or fail the request.
async function sendPasswordChangedEmail({ email, name }) {
  return sendMail({
    to: email,
    subject: 'Your Roost password was changed',
    text: `Hi ${name},\n\nThe password on your Roost account was just changed.\n\nIf that was you, there's nothing more to do. If it wasn't, reset your password right away using "Forgot password" on the login screen.\n\n— Roost`,
    html: `<p>Hi ${escHtml(name)},</p><p>The password on your Roost account was just changed.</p><p>If that was you, there's nothing more to do. If it wasn't, reset your password right away using "Forgot password" on the login screen.</p><p style="color:#888;font-size:12px;">— Roost</p>`
  });
}

async function sendAccountDeletedEmail({ email, name }) {
  return sendMail({
    to: email,
    subject: 'Your Roost account was deleted',
    text: `Hi ${name},\n\nYour Roost account, along with your listings and messages, has been permanently deleted.\n\nIf you didn't do this, please reply to this email right away.\n\n— Roost`,
    html: `<p>Hi ${escHtml(name)},</p><p>Your Roost account, along with your listings and messages, has been permanently deleted.</p><p>If you didn't do this, please reply to this email right away.</p><p style="color:#888;font-size:12px;">— Roost</p>`
  });
}

module.exports = { sendPasswordChangedEmail, sendAccountDeletedEmail };
