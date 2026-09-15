const nodemailer = require('nodemailer');

const emailConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
if (emailConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function sendMail({ to, subject, text, html }) {
  if (!emailConfigured) {
    console.log(`[email skipped — SMTP not configured] Would have sent "${subject}" to ${to}`);
    return { skipped: true };
  }
  return transporter.sendMail({
    // Without an explicit display name, email clients fall back to showing
    // whatever's before the @ as the "sender name" — e.g. literally "hello"
    // for hello@roostmarketplace.com, which reads like a person's name
    // rather than the actual sender.
    from: `"Roost" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
    to, subject, text, html
  });
}

module.exports = { sendMail, emailConfigured };
