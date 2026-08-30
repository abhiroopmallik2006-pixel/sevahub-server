const sgMail = require('@sendgrid/mail');

const API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;

if (API_KEY) {
  sgMail.setApiKey(API_KEY);
}

/**
 * Sends a one-time-password email via SendGrid.
 * In development, if SENDGRID_API_KEY is not configured, the OTP is
 * logged to the console instead of failing, so local testing without
 * a real key still works end-to-end.
 */
async function sendOtpEmail(toEmail, otp, { purpose = 'REGISTER' } = {}) {
  const subjectByPurpose = {
    REGISTER: 'Verify your email — SevaHub',
    LOGIN: 'Your SevaHub login code',
    RESET: 'Reset your SevaHub password',
  };
  const subject = subjectByPurpose[purpose] || subjectByPurpose.REGISTER;

  if (!API_KEY || !FROM_EMAIL) {
    console.warn(
      `[mailer] SENDGRID_API_KEY / SENDGRID_FROM_EMAIL not set — printing OTP instead of emailing.\n` +
      `[mailer] To: ${toEmail} | OTP: ${otp} | Purpose: ${purpose}`
    );
    return { simulated: true };
  }

  const msg = {
    to: toEmail,
    from: FROM_EMAIL,
    subject,
    text: `Your SevaHub verification code is ${otp}. It expires in 10 minutes. Do not share this code with anyone.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#F97316;margin:0 0 12px">SevaHub</h2>
        <p style="font-size:15px;color:#17202a">Your verification code is:</p>
        <div style="font-size:32px;font-weight:800;letter-spacing:6px;background:#F8FAFC;border-radius:12px;padding:16px 20px;text-align:center;margin:16px 0">${otp}</div>
        <p style="font-size:13px;color:#68737d">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>`,
  };

  try {
    await sgMail.send(msg);
    return { simulated: false };
  } catch (err) {
    const detail = err?.response?.body || err.message;
    console.error('[mailer] SendGrid send failed:', detail);
    throw new Error('Could not send verification email. Please try again.');
  }
}

module.exports = { sendOtpEmail };
