// routes/adminRoutes.js
// All routes here require admin authentication.
// Mount in server.js as: app.use('/api/admin', require('./routes/adminRoutes'));

const express = require('express');
const router = express.Router();
const adminMiddleware = require('../middleware/adminMiddleware');
const User = require('../models/User');
const UserData = require('../models/UserData'); // your financial data model

// Apply admin middleware to ALL routes in this file
router.use(adminMiddleware);

// ─────────────────────────────────────────────
// GET /api/admin/dashboard
// Returns full stats, users, records, and chart data
// ─────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
    try {
        // ── Fetch all users ──
        const users = await User.find({}).select('-password').lean();

        // ── Fetch all financial data ──
        const allData = await UserData.find({}).lean();

        // ── Flatten all transactions with user info ──
        const allTransactions = [];
        const userDataMap = {};

        for (const d of allData) {
            const user = users.find(u => u._id.toString() === d.userId.toString());
            const userEmail = user?.email || 'unknown';
            const userName = user?.name || 'Unknown';
            userDataMap[d.userId.toString()] = d;

            (d.transactions || []).forEach(tx => {
                allTransactions.push({ ...tx, userId: d.userId, userEmail, userName });
            });
        }

        // ── Aggregate totals ──
        const totalIncome = allTransactions
            .filter(t => t.type === 'income')
            .reduce((s, t) => s + (t.amount || 0), 0);

        const totalExpenses = allTransactions
            .filter(t => t.type === 'expense')
            .reduce((s, t) => s + (t.amount || 0), 0);

        const totalGoals = allData.reduce((s, d) => s + (d.goals?.length || 0), 0);
        const completedGoals = allData.reduce((s, d) => {
            return s + (d.goals || []).filter(g => g.target > 0 && g.saved >= g.target).length;
        }, 0);
        const totalBudgets = allData.reduce((s, d) => s + (d.budget?.length || 0), 0);
        const totalShoppingItems = allData.reduce((s, d) => s + (d.shopping?.length || 0), 0);

        // ── Monthly signups (last 6 months) ──
        const now = new Date();
        const monthlySignups = [];
        const incomeByMonth = [];
        const expenseByMonth = [];
        const monthlyTrend = [];

        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
            const label = d.toLocaleString('en', { month: 'short', year: '2-digit' });
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

            const signupsInMonth = users.filter(u => {
                const c = new Date(u.createdAt);
                return c >= d && c < next;
            }).length;

            const monthTxs = allTransactions.filter(t => t.date?.startsWith(monthKey));
            const monthInc = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
            const monthExp = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

            monthlySignups.push({ month: label, count: signupsInMonth });
            incomeByMonth.push(monthInc);
            expenseByMonth.push(monthExp);
            monthlyTrend.push({ month: label, income: monthInc, expenses: monthExp });
        }

        // ── This month stats ──
        const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const newUsersThisMonth = users.filter(u => {
            const c = new Date(u.createdAt);
            return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}` === thisMonthKey;
        }).length;
        const txsThisMonth = allTransactions.filter(t => t.date?.startsWith(thisMonthKey)).length;

        // ── Top categories ──
        const catMap = {};
        allTransactions.filter(t => t.type === 'expense' && t.cat).forEach(t => {
            catMap[t.cat] = (catMap[t.cat] || 0) + t.amount;
        });
        const topCategories = Object.entries(catMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 7)
            .map(([category, total]) => ({ category, total }));

        // ── Admin count ──
        const adminCount = users.filter(u => u.isAdmin).length;

        // ── Recent activity (last 10 events synthesized from signups + tx dates) ──
        const recentActivity = users
            .slice()
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 10)
            .map(u => ({
                type: 'signup',
                message: `${u.name} signed up`,
                time: u.createdAt,
            }));

        // ── Recent users (5 most recently created) ──
        const recentUsers = users
            .slice()
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5)
            .map(u => ({
                ...u,
                transactionCount: (userDataMap[u._id.toString()]?.transactions || []).length,
                goalCount: (userDataMap[u._id.toString()]?.goals || []).length,
            }));

        // ── Enrich all users with counts ──
        const enrichedUsers = users.map(u => ({
            ...u,
            transactionCount: (userDataMap[u._id.toString()]?.transactions || []).length,
            goalCount: (userDataMap[u._id.toString()]?.goals || []).length,
        }));

        res.json({
            totalUsers: users.length,
            totalTransactions: allTransactions.length,
            totalIncome,
            totalExpenses,
            totalGoals,
            completedGoals,
            totalBudgets,
            totalShoppingItems,
            adminCount,
            newUsersThisMonth,
            txsThisMonth,
            monthlySignups,
            incomeByMonth,
            expenseByMonth,
            monthlyTrend,
            topCategories,
            recentActivity,
            recentUsers,
            users: enrichedUsers,
            allTransactions,
        });
    } catch (err) {
        console.error('Admin dashboard error:', err);
        res.status(500).json({ error: 'Failed to load dashboard data.' });
    }
});

// ─────────────────────────────────────────────
// GET /api/admin/users
// Returns paginated users
// ─────────────────────────────────────────────
router.get('/users', async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '', role } = req.query;
        const query = {};
        if (search) query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } }
        ];
        if (role === 'admin') query.isAdmin = true;
        if (role === 'user') query.isAdmin = { $ne: true };

        const total = await User.countDocuments(query);
        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .lean();

        res.json({ users, total, page: Number(page), totalPages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users.' });
    }
});

// ─────────────────────────────────────────────
// DELETE /api/admin/users/:id
// Permanently deletes a user and all their data
// ─────────────────────────────────────────────
router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent self-deletion
        if (req.user._id.toString() === id) {
            return res.status(400).json({ error: 'You cannot delete your own admin account.' });
        }

        await User.findByIdAndDelete(id);
        await UserData.findOneAndDelete({ userId: id });

        res.json({ success: true, message: 'User and all their data deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete user.' });
    }
});

// ─────────────────────────────────────────────
// PATCH /api/admin/users/:id/toggle-admin
// Promotes or demotes a user's admin status
// ─────────────────────────────────────────────
router.patch('/users/:id/toggle-admin', async (req, res) => {
    try {
        const { id } = req.params;
        if (req.user._id.toString() === id) {
            return res.status(400).json({ error: 'Cannot change your own admin status.' });
        }
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ error: 'User not found.' });
        user.isAdmin = !user.isAdmin;
        await user.save();
        res.json({ success: true, isAdmin: user.isAdmin });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update user.' });
    }
});

// ─────────────────────────────────────────────
// GET /api/admin/stats
// Lightweight stats-only endpoint for quick refresh
// ─────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        const [totalUsers, allData] = await Promise.all([
            User.countDocuments(),
            UserData.find({}).lean(),
        ]);

        const allTx = allData.flatMap(d => d.transactions || []);
        const totalTransactions = allTx.length;
        const totalIncome = allTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const totalExpenses = allTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const totalGoals = allData.reduce((s, d) => s + (d.goals?.length || 0), 0);

        res.json({ totalUsers, totalTransactions, totalIncome, totalExpenses, totalGoals });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch stats.' });
    }
});

module.exports = router;
// middleware/adminMiddleware.js
// Verifies the user is authenticated AND has isAdmin: true

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const adminMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided. Please log in.' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id).select('-password');
        if (!user) {
            return res.status(401).json({ error: 'User not found.' });
        }

        if (!user.isAdmin) {
            return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        }

        req.user = user;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Session expired. Please log in again.' });
        }
        return res.status(401).json({ error: 'Invalid token.' });
    }
};

module.exports = adminMiddleware;