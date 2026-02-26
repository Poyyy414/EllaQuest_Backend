const pool = require('../config/database');
const bcrypt = require('bcrypt');

// ================= GET OWN PROFILE =================
const getProfile = async (req, res) => {
    const user_id = req.user.user_id;

    try {
        const result = await pool.query(
            `SELECT 
                u.user_id,
                u.first_name,
                u.last_name,
                u.email,
                r.role_name,
                u.created_at
             FROM users u
             JOIN roles r ON u.role_id = r.role_id
             JOIN curriculum_manager cm ON u.user_id = cm.user_id
             WHERE u.user_id = $1`,
            [user_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Curriculum Manager not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        res.status(500).json({ message: 'Error fetching profile', error: error.message });
    }
};

// ================= UPDATE OWN PROFILE =================
const updateProfile = async (req, res) => {
    const user_id = req.user.user_id;
    const { first_name, last_name, email } = req.body;

    try {
        const staffEmailRegex = /^[^\s@]+@ncf\.edu\.ph$/;
        if (!staffEmailRegex.test(email)) {
            return res.status(400).json({
                message: 'Curriculum Managers must use a @ncf.edu.ph email address'
            });
        }

        const result = await pool.query(
            `UPDATE users
             SET first_name = $1,
                 last_name = $2,
                 email = $3,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $4
             RETURNING user_id, first_name, last_name, email, updated_at`,
            [first_name, last_name, email, user_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Curriculum Manager not found' });
        }

        res.json({
            message: 'Profile updated successfully',
            user: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({ message: 'Error updating profile', error: error.message });
    }
};

// ================= CHANGE PASSWORD =================
const changePassword = async (req, res) => {
    const user_id = req.user.user_id;
    const { current_password, new_password } = req.body;

    try {
        const userResult = await pool.query(
            'SELECT password FROM users WHERE user_id = $1',
            [user_id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Curriculum Manager not found' });
        }

        const isMatch = await bcrypt.compare(
            current_password,
            userResult.rows[0].password
        );

        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);

        await pool.query(
            `UPDATE users
             SET password = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $2`,
            [hashedPassword, user_id]
        );

        res.json({ message: 'Password changed successfully' });

    } catch (error) {
        res.status(500).json({ message: 'Error changing password', error: error.message });
    }
};

// ================= CREATE MATERIAL =================
const createMaterial = async (req, res) => {
    const user_id = req.user.user_id;
    const { title, description, material_type, status } = req.body;

    try {
        const cmResult = await pool.query(
            'SELECT curriculum_manager_id FROM curriculum_manager WHERE user_id = $1',
            [user_id]
        );

        if (cmResult.rows.length === 0) {
            return res.status(404).json({ message: 'Curriculum Manager not found' });
        }

        const manager_id = cmResult.rows[0].curriculum_manager_id;

        const result = await pool.query(
            `INSERT INTO materials 
                (manager_id, title, description, material_type, upload_by, status)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [manager_id, title, description, material_type, user_id, status || 'active']
        );

        res.status(201).json({
            message: 'Material created successfully',
            material: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({ message: 'Error creating material', error: error.message });
    }
};

// ================= GET ALL MATERIALS =================
const getAllMaterials = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                m.*,
                u.first_name || ' ' || u.last_name AS uploaded_by_name
             FROM materials m
             JOIN users u ON m.upload_by = u.user_id
             ORDER BY m.timestamp DESC`
        );

        res.json(result.rows);

    } catch (error) {
        res.status(500).json({ message: 'Error fetching materials', error: error.message });
    }
};

// ================= GET MATERIAL BY ID =================
const getMaterialById = async (req, res) => {
    const { material_id } = req.params;

    try {
        const result = await pool.query(
            `SELECT 
                m.*,
                u.first_name || ' ' || u.last_name AS uploaded_by_name
             FROM materials m
             JOIN users u ON m.upload_by = u.user_id
             WHERE m.material_id = $1`,
            [material_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Material not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        res.status(500).json({ message: 'Error fetching material', error: error.message });
    }
};

// ================= UPDATE MATERIAL =================
const updateMaterial = async (req, res) => {
    const { material_id } = req.params;
    const { title, description, material_type, status } = req.body;

    try {
        const result = await pool.query(
            `UPDATE materials
             SET title = $1,
                 description = $2,
                 material_type = $3,
                 status = $4
             WHERE material_id = $5
             RETURNING *`,
            [title, description, material_type, status, material_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Material not found' });
        }

        res.json({
            message: 'Material updated successfully',
            material: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({ message: 'Error updating material', error: error.message });
    }
};

// ================= DELETE MATERIAL =================
const deleteMaterial = async (req, res) => {
    const { material_id } = req.params;

    try {
        const result = await pool.query(
            'DELETE FROM materials WHERE material_id = $1 RETURNING *',
            [material_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Material not found' });
        }

        res.json({ message: 'Material deleted successfully' });

    } catch (error) {
        res.status(500).json({ message: 'Error deleting material', error: error.message });
    }
};

// ================= CREATE QUEST =================
const createQuest = async (req, res) => {
    const { material_id, quiz_id, activity_id, skill_type, level_order, status } = req.body;

    try {
        const materialCheck = await pool.query(
            'SELECT * FROM materials WHERE material_id = $1',
            [material_id]
        );

        if (materialCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Material not found' });
        }

        const result = await pool.query(
            `INSERT INTO quests
                (material_id, quiz_id, activity_id, skill_type, level_order, status)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [material_id, quiz_id, activity_id, skill_type, level_order, status || 'active']
        );

        res.status(201).json({
            message: 'Quest created successfully',
            quest: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({ message: 'Error creating quest', error: error.message });
    }
};

// ================= GET ALL QUESTS =================
const getAllQuests = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                q.*,
                m.title AS material_title
             FROM quests q
             JOIN materials m ON q.material_id = m.material_id
             ORDER BY q.level_order ASC`
        );

        res.json(result.rows);

    } catch (error) {
        res.status(500).json({ message: 'Error fetching quests', error: error.message });
    }
};

// ================= GET QUEST BY ID =================
const getQuestById = async (req, res) => {
    const { quest_id } = req.params;

    try {
        const result = await pool.query(
            `SELECT 
                q.*,
                m.title AS material_title
             FROM quests q
             JOIN materials m ON q.material_id = m.material_id
             WHERE q.quest_id = $1`,
            [quest_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Quest not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        res.status(500).json({ message: 'Error fetching quest', error: error.message });
    }
};

// ================= UPDATE QUEST =================
const updateQuest = async (req, res) => {
    const { quest_id } = req.params;
    const { skill_type, level_order, status } = req.body;

    try {
        const result = await pool.query(
            `UPDATE quests
             SET skill_type = $1,
                 level_order = $2,
                 status = $3
             WHERE quest_id = $4
             RETURNING *`,
            [skill_type, level_order, status, quest_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Quest not found' });
        }

        res.json({
            message: 'Quest updated successfully',
            quest: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({ message: 'Error updating quest', error: error.message });
    }
};

// ================= DELETE QUEST =================
const deleteQuest = async (req, res) => {
    const { quest_id } = req.params;

    try {
        const result = await pool.query(
            'DELETE FROM quests WHERE quest_id = $1 RETURNING *',
            [quest_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Quest not found' });
        }

        res.json({ message: 'Quest deleted successfully' });

    } catch (error) {
        res.status(500).json({ message: 'Error deleting quest', error: error.message });
    }
};

module.exports = {
    getProfile,
    updateProfile,
    changePassword,
    createMaterial,
    getAllMaterials,
    getMaterialById,
    updateMaterial,
    deleteMaterial,
    createQuest,
    getAllQuests,
    getQuestById,
    updateQuest,
    deleteQuest
};