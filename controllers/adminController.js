const pool = require('../config/database');
const bcrypt = require('bcrypt');

// ================= GET ALL USERS =================
const getAllUsers = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                u.user_id,
                u.first_name,
                u.last_name,
                u.first_name || ' ' || u.last_name AS full_name,
                u.email,
                r.role_name,
                u.created_at
             FROM users u
             JOIN roles r ON u.role_id = r.role_id
             ORDER BY u.created_at DESC`
        );

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
};

// ================= GET ALL STUDENTS =================
const getAllStudents = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                u.user_id,
                u.first_name,
                u.last_name,
                u.first_name || ' ' || u.last_name AS full_name,
                u.email,
                u.created_at
             FROM users u
             JOIN student s ON u.user_id = s.user_id
             ORDER BY u.created_at DESC`
        );

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching students', error: error.message });
    }
};

// ================= GET ALL INSTRUCTORS =================
const getAllInstructors = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                u.user_id,
                u.first_name,
                u.last_name,
                u.first_name || ' ' || u.last_name AS full_name,
                u.email,
                u.created_at
             FROM users u
             JOIN instructor i ON u.user_id = i.user_id
             ORDER BY u.created_at DESC`
        );

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching instructors', error: error.message });
    }
};

// ================= GET ALL CURRICULUM MANAGERS =================
const getAllCurriculumManagers = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                u.user_id,
                u.first_name,
                u.last_name,
                u.first_name || ' ' || u.last_name AS full_name,
                u.email,
                u.created_at
             FROM users u
             JOIN curriculum_manager cm ON u.user_id = cm.user_id
             ORDER BY u.created_at DESC`
        );

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching curriculum managers', error: error.message });
    }
};

// ================= GET USER BY ID =================
const getUserById = async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            `SELECT 
                u.user_id,
                u.first_name,
                u.last_name,
                u.first_name || ' ' || u.last_name AS full_name,
                u.email,
                r.role_name,
                u.created_at
             FROM users u
             JOIN roles r ON u.role_id = r.role_id
             WHERE u.user_id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        res.status(500).json({ message: 'Error fetching user', error: error.message });
    }
};

// ================= UPDATE USER =================
const updateUser = async (req, res) => {
    const { id } = req.params;
    const { first_name, last_name, email, password } = req.body;

    try {
        const userCheck = await pool.query(
            'SELECT * FROM users WHERE user_id = $1',
            [id]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        let hashedPassword = userCheck.rows[0].password;

        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        const result = await pool.query(
            `UPDATE users 
             SET first_name = $1,
                 last_name = $2,
                 email = $3,
                 password = $4,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $5
             RETURNING user_id, first_name, last_name, 
                       first_name || ' ' || last_name AS full_name,
                       email, updated_at`,
            [first_name, last_name, email, hashedPassword, id]
        );

        res.json({
            message: 'User updated successfully',
            user: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({ message: 'Error updating user', error: error.message });
    }
};

// ================= DELETE USER =================
const deleteUser = async (req, res) => {
    const { id } = req.params;

    try {
        const userCheck = await pool.query(
            'SELECT * FROM users WHERE user_id = $1',
            [id]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        await pool.query('DELETE FROM users WHERE user_id = $1', [id]);

        res.json({ message: 'User deleted successfully' });

    } catch (error) {
        res.status(500).json({ message: 'Error deleting user', error: error.message });
    }
};

// ================= DASHBOARD STATS =================
const getDashboardStats = async (req, res) => {
    try {
        const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
        const totalStudents = await pool.query('SELECT COUNT(*) FROM student');
        const totalInstructors = await pool.query('SELECT COUNT(*) FROM instructor');
        const totalCurriculumManagers = await pool.query('SELECT COUNT(*) FROM curriculum_manager');
        const totalAdmins = await pool.query('SELECT COUNT(*) FROM admin');

        res.json({
            total_users: parseInt(totalUsers.rows[0].count),
            total_students: parseInt(totalStudents.rows[0].count),
            total_instructors: parseInt(totalInstructors.rows[0].count),
            total_curriculum_managers: parseInt(totalCurriculumManagers.rows[0].count),
            total_admins: parseInt(totalAdmins.rows[0].count),
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching stats', error: error.message });
    }
};

module.exports = {
    getAllUsers,
    getAllStudents,
    getAllInstructors,
    getAllCurriculumManagers,
    getUserById,
    updateUser,
    deleteUser,
    getDashboardStats
};