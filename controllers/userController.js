const pool = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ================= SHARED HELPERS =================
const studentEmailRegex    = /^[^\s@]+@gbox\.ncf\.edu\.ph$/;
const instructorEmailRegex = /^[^\s@]+@ncf\.edu\.ph$/;

const isValidNCFEmail  = (email) =>
    studentEmailRegex.test(email) || instructorEmailRegex.test(email);

const getRoleFromEmail = (email) =>
    studentEmailRegex.test(email) ? 'student' : 'instructor';

// ================= LOGIN (email + password) =================
const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query(
            `SELECT u.user_id, u.first_name, u.last_name, u.password, r.role_name
             FROM users u
             JOIN roles r ON u.role_id = r.role_id
             WHERE u.email = $1`,
            [email]
        );

        if (result.rows.length === 0)
            return res.status(400).json({ message: 'Invalid credentials' });

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch)
            return res.status(400).json({ message: 'Invalid credentials' });

        const token = jwt.sign(
            {
                user_id:    user.user_id,
                first_name: user.first_name,
                last_name:  user.last_name,
                role:       user.role_name
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_ACCESS_EXPIRATION }
        );

        res.json({ token, role: user.role_name });

    } catch (error) {
        res.status(500).json({ message: 'Error logging in', error: error.message });
    }
};

// ================= CREATE ACCOUNT (Admin only — CM and Admin) =================
const createAccount = async (req, res) => {
    const { first_name, last_name, email, password, role } = req.body;

    try {
        if (!['admin', 'curriculum_manager'].includes(role))
            return res.status(400).json({ message: 'This endpoint is only for admin/curriculum_manager' });

        if (!instructorEmailRegex.test(email))
            return res.status(400).json({ message: 'Staff must use @ncf.edu.ph email' });

        const roleResult = await pool.query(
            'SELECT role_id FROM roles WHERE role_name = $1', [role]
        );
        if (roleResult.rows.length === 0)
            return res.status(400).json({ message: 'Role not found' });

        const role_id        = roleResult.rows[0].role_id;
        const hashedPassword = await bcrypt.hash(password, 10);

        const userResult = await pool.query(
            `INSERT INTO users (first_name, last_name, email, password, role_id)
             VALUES ($1, $2, $3, $4, $5) RETURNING user_id`,
            [first_name, last_name, email, hashedPassword, role_id]
        );
        const user_id = userResult.rows[0].user_id;

        if (role === 'admin') {
            await pool.query(
                'INSERT INTO admin (user_id, access_level) VALUES ($1, $2)',
                [user_id, 'full']
            );
        } else if (role === 'curriculum_manager') {
            await pool.query('INSERT INTO curriculum_manager (user_id) VALUES ($1)', [user_id]);
        }

        res.status(201).json({ message: `Account created successfully as ${role}` });

    } catch (error) {
        res.status(500).json({ message: 'Error creating account', error: error.message });
    }
};

// ================= SSO STEP 1: GOOGLE INITIATE =================
const googleAuth = (req, res, next) => {
    const passport = require('../config/passport');
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        prompt: 'select_account'
    })(req, res, next);
};

// ================= SSO STEP 2: GOOGLE CALLBACK =================
const googleCallback = (req, res, next) => {
    const passport = require('../config/passport');

    passport.authenticate('google', { session: false }, async (err, googleUser, info) => {
        if (err)
            return res.redirect(`${process.env.FRONTEND_URL}/login?error=server_error`);

        if (!googleUser) {
            const msg = encodeURIComponent(info?.message || 'SSO login failed');
            return res.redirect(`${process.env.FRONTEND_URL}/login?error=${msg}`);
        }

        const { email, first_name, last_name } = googleUser;

        try {
            const existing = await pool.query(
                `SELECT u.user_id, u.first_name, u.last_name, r.role_name
                 FROM users u
                 JOIN roles r ON u.role_id = r.role_id
                 WHERE u.email = $1`,
                [email]
            );

            // CASE A: Already registered → full JWT → dashboard
            if (existing.rows.length > 0) {
                const user  = existing.rows[0];
                const token = jwt.sign(
                    {
                        user_id:    user.user_id,
                        first_name: user.first_name,
                        last_name:  user.last_name,
                        role:       user.role_name
                    },
                    process.env.JWT_SECRET,
                    { expiresIn: process.env.JWT_ACCESS_EXPIRATION }
                );

                return res.redirect(
                    `${process.env.FRONTEND_URL}/sso-callback?token=${token}&role=${user.role_name}`
                );
            }

            // CASE B: New user → temp token with Google profile data
            // first_name, last_name, email all stored in token
            // Frontend pre-fills them as read-only, user only sets password
            const ssoTempToken = jwt.sign(
                {
                    sso_pending: true,
                    email,
                    first_name,  // from Google ✅
                    last_name    // from Google ✅
                },
                process.env.JWT_SECRET,
                { expiresIn: '15m' }
            );

            return res.redirect(
                `${process.env.FRONTEND_URL}/register?sso_token=${ssoTempToken}`
            );

        } catch (error) {
            return res.redirect(`${process.env.FRONTEND_URL}/login?error=server_error`);
        }

    })(req, res, next);
};

// ================= SSO STEP 3: COMPLETE REGISTRATION =================
// Body: { sso_token, password }
// first_name, last_name, email all come from the verified sso_token
// User only needs to set their password
const registerSSO = async (req, res) => {
    const { sso_token, password } = req.body;

    try {
        // ── Verify temp token ──────────────────────────────────────────
        let payload;
        try {
            payload = jwt.verify(sso_token, process.env.JWT_SECRET);
        } catch {
            return res.status(401).json({
                message: 'SSO session expired. Please sign in with Google again.'
            });
        }

        if (!payload.sso_pending)
            return res.status(400).json({ message: 'Invalid SSO token.' });

        // ── All user info from Google, stored in token ─────────────────
        const { email, first_name, last_name } = payload;

        // ── Double-submit protection ───────────────────────────────────
        const existing = await pool.query(
            'SELECT user_id FROM users WHERE email = $1', [email]
        );
        if (existing.rows.length > 0)
            return res.status(409).json({
                message: 'Account already exists. Please log in instead.'
            });

        // ── Determine role from email domain ───────────────────────────
        if (!isValidNCFEmail(email))
            return res.status(400).json({
                message: 'Only @gbox.ncf.edu.ph or @ncf.edu.ph emails are allowed.'
            });

        const role       = getRoleFromEmail(email);
        const roleResult = await pool.query(
            'SELECT role_id FROM roles WHERE role_name = $1', [role]
        );
        if (roleResult.rows.length === 0)
            return res.status(400).json({ message: 'Role not found' });

        const role_id        = roleResult.rows[0].role_id;
        const hashedPassword = await bcrypt.hash(password, 10);

        // ── Insert user ────────────────────────────────────────────────
        const userResult = await pool.query(
            `INSERT INTO users (first_name, last_name, email, password, role_id)
             VALUES ($1, $2, $3, $4, $5) RETURNING user_id`,
            [first_name, last_name, email, hashedPassword, role_id]
        );
        const user_id = userResult.rows[0].user_id;

        if (role === 'student') {
            await pool.query('INSERT INTO student (user_id) VALUES ($1)', [user_id]);
        } else if (role === 'instructor') {
            await pool.query('INSERT INTO instructor (user_id) VALUES ($1)', [user_id]);
        }

        res.status(201).json({ 
            message: `Account created successfully as ${role}`,
            role 
        });

    } catch (error) {
        res.status(500).json({ message: 'Error completing registration', error: error.message });
    }
};

// ================= EXPORT =================
module.exports = {
    login,
    createAccount,
    googleAuth,
    googleCallback,
    registerSSO
};