const sgMail = require('@sendgrid/mail');

const API_KEY = process.env.SENDGRID_API_KEY;
const FROM    = process.env.SENDGRID_FROM || 'noreply@ghostbuster.app';

if (API_KEY) {
  sgMail.setApiKey(API_KEY);
}

/**
 * Send an email via SendGrid.
 * Falls back to console logging when SENDGRID_API_KEY is not configured (local dev).
 */
async function sendMail({ to, subject, text, html }) {
  if (!API_KEY) {
    console.log('[email] SENDGRID_API_KEY not set — logging instead of sending');
    console.log(`[email] To: ${to} | Subject: ${subject}`);
    console.log(`[email] Body: ${text || html}`);
    return;
  }

  const msg = { to, from: FROM, subject, ...(html ? { html } : { text }) };
  await sgMail.send(msg);
}

module.exports = { sendMail };
