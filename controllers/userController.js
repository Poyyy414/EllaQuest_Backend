const pool = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// ================= REGISTER =================
const register = async (req, res) => {
    const { name, email, password, role } = req.body;

    try {
        // 1️⃣ Validate email format based on role
        const studentEmailRegex = /^[^\s@]+@gbox\.ncf\.edu\.ph$/;
        const staffEmailRegex = /^[^\s@]+@ncf\.edu\.ph$/;

        if (role === 'student' && !studentEmailRegex.test(email)) {
            return res.status(400).json({ 
                message: 'Students must use a @gbox.ncf.edu.ph email address' 
            });
        }

        if (['admin', 'instructor', 'curriculum_manager'].includes(role) && !staffEmailRegex.test(email)) {
            return res.status(400).json({ 
                message: 'Admin, Instructor, and Curriculum Manager must use a @ncf.edu.ph email address' 
            });
        }

        // 2️⃣ Validate role exists
        const roleResult = await pool.query(
            'SELECT role_id FROM roles WHERE role_name = $1',
            [role]
        );

        if (roleResult.rows.length === 0) {
            return res.status(400).json({ message: 'Invalid role' });
        }

        const role_id = roleResult.rows[0].role_id;

        // 3️⃣ Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // 4️⃣ Insert into users table
        const userResult = await pool.query(
            'INSERT INTO users (name, email, password, role_id) VALUES ($1, $2, $3, $4) RETURNING user_id',
            [name, email, hashedPassword, role_id]
        );

        const user_id = userResult.rows[0].user_id;

        // 5️⃣ Insert into role-specific table
        if (role === 'student') {
            await pool.query('INSERT INTO student (user_id) VALUES ($1)', [user_id]);
        } else if (role === 'instructor') {
            await pool.query('INSERT INTO instructor (user_id) VALUES ($1)', [user_id]);
        } else if (role === 'curriculum_manager') {
            await pool.query('INSERT INTO curriculum_manager (user_id) VALUES ($1)', [user_id]);
        } else if (role === 'admin') {
            await pool.query('INSERT INTO admin (user_id) VALUES ($1)', [user_id]);
        }

        res.status(201).json({ message: `User registered successfully as ${role}` });

    } catch (error) {
        res.status(500).json({ message: 'Error registering user', error: error.message });
    }
};

// ================= LOGIN =================
const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query(
            `SELECT u.user_id, u.name, u.password, r.role_name
             FROM users u
             JOIN roles r ON u.role_id = r.role_id
             WHERE u.email = $1`,
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'Invalid Credentials' });
        }

        const user = result.rows[0];

        // 2️⃣ Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid Credentials' });
        }

        // 3️⃣ Sign JWT
        const token = jwt.sign(
            { user_id: user.user_id, name: user.name, role: user.role_name },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_ACCESS_EXPIRATION }
        );

        res.json({ token, role: user.role_name });

    } catch (error) {
        res.status(500).json({ message: 'Error logging in', error: error.message });
    }
};

module.exports = {
    register,
    login
};