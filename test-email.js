/**
 * BTECH Track — Email Test Script
 * Run: node test-email.js
 * Tests all 4 email types by calling your running server.
 */

require('dotenv').config();
const https = require('http');   // change to https for production

const BASE = `http://localhost:${process.env.PORT || 3001}`;
const APIKEY = process.env.BTECH_API_KEY;
const TEST_TO = process.env.SMTP_USER;   // send test to yourself

async function post(path, body) {
    const res = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': APIKEY },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    return { status: res.status, data };
}

(async () => {
    console.log('\n🧪  BTECH Track Email Test\n' + '─'.repeat(40));

    // 1. Welcome
    let r = await post('/email/welcome', { to: TEST_TO, name: 'Becam Aziz' });
    console.log('✉️  Welcome email:', r.status === 200 ? '✅ SENT' : '❌ FAILED', r.data);

    // 2. Password reset (self-service token flow)
    r = await post('/email/reset-request', { to: TEST_TO, name: 'Becam Aziz' });
    console.log('🔐  Reset request:', r.status === 200 ? '✅ SENT' : '❌ FAILED', r.data);

    // 3. Admin-approved reset
    r = await post('/email/admin-reset', {
        to: TEST_TO,
        userName: 'Becam Aziz',
        adminName: 'Admin',
        tempPassword: 'TempP@ss123',
    });
    console.log('🛡️  Admin reset:', r.status === 200 ? '✅ SENT' : '❌ FAILED', r.data);

    // 4. Notification
    r = await post('/email/notify', {
        to: TEST_TO,
        name: 'Becam Aziz',
        title: 'Budget Alert 🚨',
        message: 'You have used 90% of your Food budget for this month. Consider reviewing your spending.',
        ctaLabel: 'View Budget',
    });
    console.log('📢  Notification:', r.status === 200 ? '✅ SENT' : '❌ FAILED', r.data);

    console.log('\n' + '─'.repeat(40));
    console.log('Check your inbox at:', TEST_TO, '\n');
})();