/**
 * BTECH Track — Email Automation Backend
 * ----------------------------------------
 * Stack : Node.js + Express + Nodemailer
 * Author: BECAM AZIZ W.
 * Run   : node server.js  (or: npm start)
 */
const path = require('path');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const app = express();

// ─── Middleware ──────────────────────────────────────────────
app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.use(cors({
    origin: process.env.ALLOWED_ORIGIN || '*',   // lock to your domain in production
    methods: ['POST'],
}));

// Rate-limit all /email routes: max 10 requests per IP per 15 min
const emailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many requests — please try again later.' },
});
app.use('/email', emailLimiter);

// Simple API-key guard (set BTECH_API_KEY in your .env)
function requireApiKey(req, res, next) {
    const key = req.headers['x-api-key'];
    if (!key || key !== process.env.BTECH_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// ─── Nodemailer Transporter ──────────────────────────────────
// Supports Gmail, Outlook, Zoho, SendGrid SMTP, Mailgun SMTP, etc.
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',   // true = TLS on port 465
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// Verify connection on startup
transporter.verify((err) => {
    if (err) console.error('❌  SMTP connection failed:', err.message);
    else console.log('✅  SMTP ready — emails will send from', process.env.SMTP_USER);
});

// ─── Token Store (In-memory; replace with Redis/DB in production) ──
const tokenStore = new Map();   // token → { email, expires, type }

function createToken(email, type = 'reset', ttlMinutes = 30) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + ttlMinutes * 60 * 1000;
    tokenStore.set(token, { email, type, expires });
    // Auto-delete after expiry
    setTimeout(() => tokenStore.delete(token), ttlMinutes * 60 * 1000);
    return token;
}

function verifyToken(token, expectedType) {
    const data = tokenStore.get(token);
    if (!data) return { valid: false, reason: 'Token not found' };
    if (Date.now() > data.expires) return { valid: false, reason: 'Token expired' };
    if (data.type !== expectedType) return { valid: false, reason: 'Wrong token type' };
    return { valid: true, email: data.email };
}

// ─── Reusable HTML email wrapper ────────────────────────────
function htmlWrapper(title, bodyHtml) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F0F4F8;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F8;padding:32px 0">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,#1B5E20 0%,#2E7D32 100%);padding:28px 36px">
          <table width="100%"><tr>
            <td>
              <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.3px">BTECH Track</div>
              <div style="font-size:12px;color:rgba(255,255,255,.75);margin-top:2px">Smart Financial Management</div>
            </td>
            <td align="right">
              <div style="background:rgba(255,255,255,.15);border-radius:8px;padding:6px 12px;color:#fff;font-size:12px">
                📊 Finance Dashboard
              </div>
            </td>
          </tr></table>
        </td>
      </tr>
      <!-- Body -->
      <tr><td style="padding:36px">${bodyHtml}</td></tr>
      <!-- Footer -->
      <tr>
        <td style="background:#F8FAFC;padding:20px 36px;border-top:1px solid #E2E8F0">
          <p style="margin:0;font-size:12px;color:#94A3B8;text-align:center">
            © ${new Date().getFullYear()} BTECH Track &nbsp;·&nbsp; Created by <strong>BECAM AZIZ W.</strong><br>
            <span style="font-size:11px">If you did not request this email, please ignore it safely.</span>
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ─── Email Templates ─────────────────────────────────────────

function tplWelcome(name) {
    return {
        subject: '🎉 Welcome to BTECH Track!',
        html: htmlWrapper('Welcome!', `
      <h2 style="margin:0 0 8px;font-size:24px;color:#0B1E3D">Welcome aboard, ${name}! 👋</h2>
      <p style="color:#64748B;line-height:1.7;margin:0 0 20px">
        Your BTECH Track account is ready. You can now track your income, expenses, goals,
        budgets, and shopping lists — all in one place.
      </p>
      <div style="background:#F0FDF4;border-radius:12px;padding:20px;margin:20px 0;border-left:4px solid #22C55E">
        <p style="margin:0;font-size:14px;color:#166534;font-weight:600">🚀 Quick Start Tips</p>
        <ul style="margin:10px 0 0;color:#15803D;font-size:14px;line-height:2;padding-left:18px">
          <li>Add your first income transaction</li>
          <li>Set a monthly budget</li>
          <li>Create a savings goal</li>
          <li>Check your financial advice dashboard</li>
        </ul>
      </div>
      <table cellpadding="0" cellspacing="0" style="margin-top:24px">
        <tr><td style="background:#1B5E20;border-radius:8px;padding:12px 28px">
          <a href="${process.env.APP_URL}" style="color:#fff;text-decoration:none;font-weight:600;font-size:15px">
            Open BTECH Track →
          </a>
        </td></tr>
      </table>
    `),
    };
}

function tplPasswordReset(name, token) {
    const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;
    return {
        subject: '🔐 Password Reset Request — BTECH Track',
        html: htmlWrapper('Reset Password', `
      <h2 style="margin:0 0 8px;font-size:22px;color:#0B1E3D">Reset your password</h2>
      <p style="color:#64748B;line-height:1.7;margin:0 0 20px">
        Hi <strong>${name}</strong>, we received a request to reset your BTECH Track password.
        Click the button below — this link is valid for <strong>30 minutes</strong>.
      </p>
      <div style="background:#FFFBEB;border-radius:12px;padding:16px;margin:16px 0;border-left:4px solid #D97706">
        <p style="margin:0;font-size:13px;color:#92400E">
          ⚠️ <strong>Security notice:</strong> Your password will never be sent in an email.
          Only use this button to set a new one on the BTECH Track website.
        </p>
      </div>
      <table cellpadding="0" cellspacing="0" style="margin:24px 0">
        <tr><td style="background:#1B5E20;border-radius:8px;padding:13px 32px">
          <a href="${resetUrl}" style="color:#fff;text-decoration:none;font-weight:600;font-size:15px">
            Reset Password →
          </a>
        </td></tr>
      </table>
      <p style="font-size:12px;color:#94A3B8;margin:0">
        Or copy this URL into your browser:<br>
        <span style="color:#2563EB;font-size:11px;word-break:break-all">${resetUrl}</span>
      </p>
      <p style="font-size:12px;color:#94A3B8;margin:16px 0 0">
        Didn't request this? You can safely ignore this email — your password won't change.
      </p>
    `),
    };
}

function tplAdminPasswordReset(userName, adminName, tempPassword) {
    return {
        subject: '✅ Your Password Has Been Reset — BTECH Track',
        html: htmlWrapper('Password Reset Approved', `
      <h2 style="margin:0 0 8px;font-size:22px;color:#0B1E3D">Your reset was approved</h2>
      <p style="color:#64748B;line-height:1.7;margin:0 0 20px">
        Hi <strong>${userName}</strong>, your password reset request was approved by admin
        <strong>${adminName}</strong>. Use the temporary password below to sign in,
        then change it immediately in your settings.
      </p>
      <div style="background:#F0FDF4;border-radius:12px;padding:20px;margin:20px 0;text-align:center">
        <p style="margin:0;font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:.08em">Temporary Password</p>
        <p style="margin:10px 0 0;font-size:26px;font-weight:700;color:#1B5E20;letter-spacing:3px;font-family:monospace">
          ${tempPassword}
        </p>
        <p style="margin:8px 0 0;font-size:12px;color:#94A3B8">This password is valid for 24 hours only</p>
      </div>
      <div style="background:#FEF2F2;border-radius:12px;padding:16px;border-left:4px solid #DC2626">
        <p style="margin:0;font-size:13px;color:#991B1B">
          🔒 <strong>Change this password immediately</strong> after signing in.
          Never share your password with anyone.
        </p>
      </div>
      <table cellpadding="0" cellspacing="0" style="margin-top:22px">
        <tr><td style="background:#1B5E20;border-radius:8px;padding:12px 28px">
          <a href="${process.env.APP_URL}" style="color:#fff;text-decoration:none;font-weight:600;font-size:15px">
            Sign In Now →
          </a>
        </td></tr>
      </table>
    `),
    };
}

function tplNotification(name, title, message, ctaLabel = 'View Dashboard', ctaUrl = process.env.APP_URL) {
    return {
        subject: `📢 ${title} — BTECH Track`,
        html: htmlWrapper(title, `
      <h2 style="margin:0 0 8px;font-size:22px;color:#0B1E3D">${title}</h2>
      <p style="color:#64748B;line-height:1.7;margin:0 0 20px">Hi <strong>${name}</strong>,</p>
      <div style="background:#EFF6FF;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #2563EB">
        <p style="margin:0;font-size:15px;color:#1E3A5F;line-height:1.7">${message}</p>
      </div>
      <table cellpadding="0" cellspacing="0" style="margin-top:24px">
        <tr><td style="background:#1B5E20;border-radius:8px;padding:12px 28px">
          <a href="${ctaUrl}" style="color:#fff;text-decoration:none;font-weight:600;font-size:15px">
            ${ctaLabel} →
          </a>
        </td></tr>
      </table>
    `),
    };
}

function tplAccountLocked(name) {
    return {
        subject: '🔒 Your BTECH Track Account Has Been Locked',
        html: htmlWrapper('Account Locked', `
      <h2 style="margin:0 0 8px;font-size:22px;color:#0B1E3D">Account Locked</h2>
      <p style="color:#64748B;line-height:1.7;margin:0 0 20px">
        Hi <strong>${name}</strong>, your BTECH Track account has been temporarily locked by an administrator.
      </p>
      <div style="background:#FEF2F2;border-radius:12px;padding:20px;border-left:4px solid #DC2626">
        <p style="margin:0;font-size:14px;color:#991B1B">
          If you believe this is an error or want to appeal, please contact the admin team.
        </p>
      </div>
    `),
    };
}

// ─── Send helper ─────────────────────────────────────────────
async function sendEmail(to, { subject, html }) {
    return transporter.sendMail({
        from: `"BTECH Track" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html,
    });
}

// ─── API Routes ───────────────────────────────────────────────

/**
 * POST /email/welcome
 * Body: { to, name }
 */
app.post('/email/welcome', requireApiKey, async (req, res) => {
    const { to, name } = req.body;
    if (!to || !name) return res.status(400).json({ error: 'Missing to or name' });
    try {
        await sendEmail(to, tplWelcome(name));
        res.json({ success: true, message: `Welcome email sent to ${to}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send email', detail: err.message });
    }
});

/**
 * POST /email/reset-request
 * Body: { to, name }
 * Generates a secure token and emails the reset link
 */
app.post('/email/reset-request', requireApiKey, async (req, res) => {
    const { to, name } = req.body;
    if (!to || !name) return res.status(400).json({ error: 'Missing to or name' });
    try {
        const token = createToken(to, 'reset', 30);
        await sendEmail(to, tplPasswordReset(name, token));
        res.json({ success: true, message: 'Reset email sent' });
        // NOTE: never return the token to the client
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send email', detail: err.message });
    }
});

/**
 * POST /email/admin-reset
 * Body: { to, userName, adminName, tempPassword }
 * Called by admin after approving a reset via the admin panel
 */
app.post('/email/admin-reset', requireApiKey, async (req, res) => {
    const { to, userName, adminName, tempPassword } = req.body;
    if (!to || !userName || !adminName || !tempPassword)
        return res.status(400).json({ error: 'Missing required fields' });
    try {
        await sendEmail(to, tplAdminPasswordReset(userName, adminName, tempPassword));
        res.json({ success: true, message: 'Admin reset email sent' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send email', detail: err.message });
    }
});

/**
 * POST /email/notify
 * Body: { to, name, title, message, ctaLabel?, ctaUrl? }
 */
app.post('/email/notify', requireApiKey, async (req, res) => {
    const { to, name, title, message, ctaLabel, ctaUrl } = req.body;
    if (!to || !name || !title || !message)
        return res.status(400).json({ error: 'Missing required fields' });
    try {
        await sendEmail(to, tplNotification(name, title, message, ctaLabel, ctaUrl));
        res.json({ success: true, message: 'Notification sent' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send email', detail: err.message });
    }
});

/**
 * POST /email/account-locked
 * Body: { to, name }
 */
app.post('/email/account-locked', requireApiKey, async (req, res) => {
    const { to, name } = req.body;
    if (!to || !name) return res.status(400).json({ error: 'Missing to or name' });
    try {
        await sendEmail(to, tplAccountLocked(name));
        res.json({ success: true, message: 'Lock notification sent' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send email', detail: err.message });
    }
});

/**
 * POST /email/verify-token
 * Body: { token, type }
 * Used by the frontend to check if a reset token is still valid
 */
app.post('/email/verify-token', async (req, res) => {
    const { token, type } = req.body;
    const result = verifyToken(token, type || 'reset');
    if (result.valid) {
        tokenStore.delete(token);   // one-time use
        res.json({ valid: true, email: result.email });
    } else {
        res.status(400).json({ valid: false, reason: result.reason });
    }
});

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', smtp: process.env.SMTP_HOST }));

// ─── Start ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀  BTECH Track email server running on port ${PORT}`));
