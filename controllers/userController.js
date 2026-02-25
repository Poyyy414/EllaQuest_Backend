const pool = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// ================= REGISTER =================
const register = async (req, res) => {
    const { first_name, last_name, email, password } = req.body;

    try {
        // Auto-detect role based on email
        const studentEmailRegex = /^[^\s@]+@gbox\.ncf\.edu\.ph$/;
        const instructorEmailRegex = /^[^\s@]+@ncf\.edu\.ph$/;

        let role = null;
        if (studentEmailRegex.test(email)) role = 'student';
        else if (instructorEmailRegex.test(email)) role = 'instructor';
        else return res.status(400).json({ 
            message: 'Only @gbox.ncf.edu.ph (students) and @ncf.edu.ph (instructors) emails are allowed'
        });

        // Get role_id
        const roleResult = await pool.query('SELECT role_id FROM roles WHERE role_name = $1', [role]);
        if (roleResult.rows.length === 0) return res.status(400).json({ message: 'Role not found' });

        const role_id = roleResult.rows[0].role_id;

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert into users
        const userResult = await pool.query(
            'INSERT INTO users (first_name, last_name, email, password, role_id) VALUES ($1, $2, $3, $4, $5) RETURNING user_id',
            [first_name, last_name, email, hashedPassword, role_id]
        );
        const user_id = userResult.rows[0].user_id;

        // Insert into role-specific table
        if (role === 'student') await pool.query('INSERT INTO student (user_id) VALUES ($1)', [user_id]);
        else if (role === 'instructor') await pool.query('INSERT INTO instructor (user_id) VALUES ($1)', [user_id]);

        res.status(201).json({ message: `User registered successfully as ${role}` });

    } catch (error) {
        res.status(500).json({ message: 'Error registering user', error: error.message });
    }
};

// ================= CREATE ACCOUNT (Admin/Curriculum Manager) =================
const createAccount = async (req, res) => {
    const { first_name, last_name, email, password, role } = req.body;

    try {
        // Only allow admin and curriculum_manager
        if (!['admin', 'curriculum_manager'].includes(role)) {
            return res.status(400).json({ message: 'This endpoint is only for admin/curriculum_manager' });
        }

        // Staff email validation
        const staffEmailRegex = /^[^\s@]+@ncf\.edu\.ph$/;
        if (!staffEmailRegex.test(email)) return res.status(400).json({ message: 'Staff must use @ncf.edu.ph email' });

        // Get role_id
        const roleResult = await pool.query('SELECT role_id FROM roles WHERE role_name = $1', [role]);
        if (roleResult.rows.length === 0) return res.status(400).json({ message: 'Role not found' });
        const role_id = roleResult.rows[0].role_id;

        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert into users
        const userResult = await pool.query(
            'INSERT INTO users (first_name, last_name, email, password, role_id) VALUES ($1, $2, $3, $4, $5) RETURNING user_id',
            [first_name, last_name, email, hashedPassword, role_id]
        );
        const user_id = userResult.rows[0].user_id;

        // Insert into admin or curriculum_manager table
        if (role === 'admin') await pool.query('INSERT INTO admin (user_id) VALUES ($1)', [user_id]);
        else if (role === 'curriculum_manager') await pool.query('INSERT INTO curriculum_manager (user_id) VALUES ($1)', [user_id]);

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
            { user_id: user.user_id, first_name: user.first_name, last_name: user.last_name, role: user.role_name },
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
    login
};