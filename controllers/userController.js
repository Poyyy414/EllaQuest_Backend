const pool = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// ================= BREVO HTTP API =================
const sendEmail = async (to, code, attemptsLeft) => {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'api-key': process.env.BREVO_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            sender: { 
                email: process.env.BREVO_SENDER_EMAIL, 
                name: 'NCF System' 
            },
            to: [{ email: to }],
            subject: 'NCF Email Verification Code',
            htmlContent: `
                <div style="font-family: Arial, sans-serif; max-width: 400px; margin: auto;">
                    <h2 style="color: #2c3e50;">NCF Verification Code</h2>
                    <p>Your verification code is:</p>
                    <h1 style="letter-spacing: 8px; color: #e74c3c;">${code}</h1>
                    <p>This code expires in <strong>30 minutes</strong>.</p>
                    <p>You have <strong>${attemptsLeft}</strong> resend attempt(s) remaining today.</p>
                    <p style="color: #999; font-size: 12px;">If you did not request this, please ignore this email.</p>
                </div>
            `
        })
    });

    const data = await response.json();
    console.log('Brevo response:', JSON.stringify(data));

    if (!response.ok) {
        throw new Error(data.message || 'Failed to send email');
    }

    return data;
};

// ================= HELPER: IS SAME DAY =================
const isSameDay = (date1, date2) => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return (
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate()
    );
};

// ================= SEND VERIFICATION CODE =================
const sendVerificationCode = async (req, res) => {
    const { email } = req.body;

    console.log('BREVO_API_KEY:', process.env.BREVO_API_KEY ? 'LOADED ✅' : 'MISSING ❌');
    console.log('BREVO_SENDER_EMAIL:', process.env.BREVO_SENDER_EMAIL ? 'LOADED ✅' : 'MISSING ❌');

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

        let attempts = 0;

        if (existing.rows.length > 0) {
            const record = existing.rows[0];
            const today = new Date();
            const isToday = isSameDay(record.created_at, today);

            if (isToday) {
                // Same day — enforce max 5 attempts per day
                if (record.attempts >= 5) {
                    return res.status(429).json({ 
                        message: 'Maximum 5 attempts reached for today. Please try again tomorrow.',
                        attemptsLeft: 0
                    });
                }

                // Check 3 minute cooldown
                if (record.resend_at && new Date() < new Date(record.resend_at)) {
                    const secondsLeft = Math.ceil((new Date(record.resend_at) - new Date()) / 1000);
                    const minutesLeft = Math.ceil(secondsLeft / 60);
                    return res.status(429).json({ 
                        message: `Please wait ${minutesLeft} minute(s) before requesting a new code.`,
                        secondsLeft
                    });
                }

                // Carry over today's attempt count
                attempts = record.attempts;

            } else {
                // Different day — reset (new day, fresh 5 attempts)
                attempts = 0;
            }
        }

        // Generate 6-digit OTP
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry    = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        const resend_at = new Date(Date.now() +  3 * 60 * 1000); // 3 minute cooldown
        const newAttempts = attempts + 1;
        const attemptsLeft = 5 - newAttempts;

        // Delete old record and insert fresh one
        await pool.query('DELETE FROM email_verification WHERE email = $1', [email]);
        await pool.query(
            `INSERT INTO email_verification 
             (email, code, expiry, resend_at, attempts, verified, created_at) 
             VALUES ($1, $2, $3, $4, $5, false, NOW())`,
            [email, code, expiry, resend_at, newAttempts]
        );

        // Send via Brevo HTTP API
        await sendEmail(email, code, attemptsLeft);

        res.json({ 
            message: 'Verification code sent! Check your email.',
            attemptsLeft,
            resendIn: 180,   // 3 minutes in seconds
            expiresIn: 1800  // 30 minutes in seconds
        });

    } catch (error) {
        res.status(500).json({ message: 'Error sending code', error: error.message });
    }
};

// ================= REGISTER =================
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

        // Check expiry (30 minutes)
        if (new Date() > new Date(record.expiry)) {
            return res.status(400).json({ 
                message: 'Code has expired. Please request a new one.',
                expired: true
            });
        }

        // Check code match
        if (record.code !== code) {
            return res.status(400).json({ 
                message: 'Invalid verification code. Please try again.',
                invalid: true
            });
        }

        // Determine role from email
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
        if (roleResult.rows.length === 0) {
            return res.status(400).json({ message: 'Role not found' });
        }
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

        // Clean up verification record after successful registration
        await pool.query('DELETE FROM email_verification WHERE email = $1', [email]);

        res.status(201).json({ message: `User registered successfully as ${role}` });

    } catch (error) {
        res.status(500).json({ message: 'Error registering user', error: error.message });
    }
};

// ================= CREATE ACCOUNT (Admin only — for CM and Admin accounts) =================
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

        const roleResult = await pool.query(
            'SELECT role_id FROM roles WHERE role_name = $1', [role]
        );
        if (roleResult.rows.length === 0) {
            return res.status(400).json({ message: 'Role not found' });
        }
        const role_id = roleResult.rows[0].role_id;

        const hashedPassword = await bcrypt.hash(password, 10);

        const userResult = await pool.query(
            'INSERT INTO users (first_name, last_name, email, password, role_id) VALUES ($1, $2, $3, $4, $5) RETURNING user_id',
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

        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'Invalid Credentials' });
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid Credentials' });
        }

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