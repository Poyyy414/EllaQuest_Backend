const pool = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// ================= BREVO SMTP SETUP (port 465) =================
const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 465,
    secure: true, // true for port 465
    auth: {
        user: process.env.BREVO_SENDER_EMAIL,
        pass: process.env.BREVO_SMTP_KEY
    }
});

// ================= SEND VERIFICATION CODE =================
const sendVerificationCode = async (req, res) => {
    const { email } = req.body;

    try {
        // Validate email domain
        const studentEmailRegex = /^[^\s@]+@gbox\.ncf\.edu\.ph$/;
        const instructorEmailRegex = /^[^\s@]+@ncf\.edu\.ph$/;

        if (!studentEmailRegex.test(email) && !instructorEmailRegex.test(email)) {
            return res.status(400).json({ 
                message: 'Only @gbox.ncf.edu.ph or @ncf.edu.ph emails are allowed' 
            });
        }

        // Check existing record
        const existing = await pool.query(
            'SELECT * FROM email_verification WHERE email = $1',
            [email]
        );

        if (existing.rows.length > 0) {
            const record = existing.rows[0];

            // Check max resend attempts (3 max)
            if (record.attempts >= 3) {
                return res.status(429).json({ 
                    message: 'Maximum resend attempts reached. Please try again later.' 
                });
            }

            // Check resend cooldown (1 minute)
            if (record.resend_at && new Date() < new Date(record.resend_at)) {
                const secondsLeft = Math.ceil((new Date(record.resend_at) - new Date()) / 1000);
                return res.status(429).json({ 
                    message: `Please wait ${secondsLeft} seconds before requesting a new code.`,
                    secondsLeft
                });
            }
        }

        // Generate 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 10 * 60 * 1000);   // 10 minutes
        const resend_at = new Date(Date.now() + 1 * 60 * 1000); // 1 minute cooldown
        const attempts = (existing.rows[0]?.attempts || 0) + 1;

        // Delete old and insert new
        await pool.query('DELETE FROM email_verification WHERE email = $1', [email]);
        await pool.query(
            'INSERT INTO email_verification (email, code, expiry, resend_at, attempts, verified) VALUES ($1, $2, $3, $4, $5, false)',
            [email, code, expiry, resend_at, attempts]
        );

        // Send email via Brevo SMTP
        await transporter.sendMail({
            from: `"NCF System" <${process.env.BREVO_SENDER_EMAIL}>`,
            to: email,
            subject: 'NCF Email Verification Code',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 400px; margin: auto;">
                    <h2 style="color: #2c3e50;">NCF Verification Code</h2>
                    <p>Your verification code is:</p>
                    <h1 style="letter-spacing: 8px; color: #e74c3c;">${code}</h1>
                    <p>This code expires in <strong>10 minutes</strong>.</p>
                    <p>You have <strong>${3 - attempts}</strong> resend attempt(s) remaining.</p>
                    <p style="color: #999; font-size: 12px;">If you did not request this, please ignore this email.</p>
                </div>
            `
        });

        res.json({ 
            message: 'Verification code sent! Check your email.',
            attemptsLeft: 3 - attempts,
            resendIn: 60
        });

    } catch (error) {
        res.status(500).json({ message: 'Error sending code', error: error.message });
    }
};

// ================= REGISTER (with inline code verification) =================
const register = async (req, res) => {
    const { first_name, last_name, email, password, code } = req.body;

    try {
        const verifyResult = await pool.query(
            'SELECT * FROM email_verification WHERE email = $1',
            [email]
        );

        if (verifyResult.rows.length === 0) {
            return res.status(400).json({ 
                message: 'No verification code found. Please request a code first.' 
            });
        }

        const record = verifyResult.rows[0];

        if (new Date() > new Date(record.expiry)) {
            return res.status(400).json({ 
                message: 'Code has expired. Please request a new one.',
                expired: true
            });
        }

        if (record.code !== code) {
            return res.status(400).json({ 
                message: 'Invalid verification code. Please try again.',
                invalid: true
            });
        }

        const studentEmailRegex = /^[^\s@]+@gbox\.ncf\.edu\.ph$/;
        const instructorEmailRegex = /^[^\s@]+@ncf\.edu\.ph$/;

        let role = null;
        if (studentEmailRegex.test(email)) role = 'student';
        else if (instructorEmailRegex.test(email)) role = 'instructor';
        else return res.status(400).json({ 
            message: 'Only @gbox.ncf.edu.ph (students) and @ncf.edu.ph (instructors) emails are allowed'
        });

        const roleResult = await pool.query(
            'SELECT role_id FROM roles WHERE role_name = $1', [role]
        );
        if (roleResult.rows.length === 0) return res.status(400).json({ message: 'Role not found' });
        const role_id = roleResult.rows[0].role_id;

        const hashedPassword = await bcrypt.hash(password, 10);

        const userResult = await pool.query(
            'INSERT INTO users (first_name, last_name, email, password, role_id) VALUES ($1, $2, $3, $4, $5) RETURNING user_id',
            [first_name, last_name, email, hashedPassword, role_id]
        );
        const user_id = userResult.rows[0].user_id;

        if (role === 'student') {
            await pool.query('INSERT INTO student (user_id) VALUES ($1)', [user_id]);
        } else if (role === 'instructor') {
            await pool.query('INSERT INTO instructor (user_id) VALUES ($1)', [user_id]);
        }

        await pool.query('DELETE FROM email_verification WHERE email = $1', [email]);

        res.status(201).json({ message: `User registered successfully as ${role}` });

    } catch (error) {
        res.status(500).json({ message: 'Error registering user', error: error.message });
    }
};

// ================= CREATE ACCOUNT (Admin/Curriculum Manager) =================
const createAccount = async (req, res) => {
    const { first_name, last_name, email, password, role } = req.body;

    try {
        if (!['admin', 'curriculum_manager'].includes(role)) {
            return res.status(400).json({ message: 'This endpoint is only for admin/curriculum_manager' });
        }

        const staffEmailRegex = /^[^\s@]+@ncf\.edu\.ph$/;
        if (!staffEmailRegex.test(email)) {
            return res.status(400).json({ message: 'Staff must use @ncf.edu.ph email' });
        }

        const roleResult = await pool.query('SELECT role_id FROM roles WHERE role_name = $1', [role]);
        if (roleResult.rows.length === 0) return res.status(400).json({ message: 'Role not found' });
        const role_id = roleResult.rows[0].role_id;

        const hashedPassword = await bcrypt.hash(password, 10);

        const userResult = await pool.query(
            'INSERT INTO users (first_name, last_name, email, password, role_id) VALUES ($1, $2, $3, $4, $5) RETURNING user_id',
            [first_name, last_name, email, hashedPassword, role_id]
        );
        const user_id = userResult.rows[0].user_id;

        if (role === 'admin') {
            await pool.query('INSERT INTO admin (user_id) VALUES ($1)', [user_id]);
        } else if (role === 'curriculum_manager') {
            await pool.query('INSERT INTO curriculum_manager (user_id) VALUES ($1)', [user_id]);
        }

        res.status(201).json({ message: `Account created successfully as ${role}` });

    } catch (error) {
        res.status(500).json({ message: 'Error creating account', error: error.message });
    }
};

// ================= LOGIN =================
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

        if (result.rows.length === 0) return res.status(400).json({ message: 'Invalid Credentials' });

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid Credentials' });

        const token = jwt.sign(
            { 
                user_id: user.user_id, 
                first_name: user.first_name, 
                last_name: user.last_name, 
                role: user.role_name 
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_ACCESS_EXPIRATION }
        );

        res.json({ token, role: user.role_name });

    } catch (error) {
        res.status(500).json({ message: 'Error logging in', error: error.message });
    }
};

// ================= EXPORT =================
module.exports = {
    register,
    createAccount,
    login,
    sendVerificationCode
};