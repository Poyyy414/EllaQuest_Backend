const pool = require('../config/database');

// ================= HELPER: GET CM ID =================
const getCmId = async (user_id) => {
    const result = await pool.query(
        'SELECT cm_id FROM curriculum_manager WHERE user_id = $1',
        [user_id]
    );
    if (result.rows.length === 0) throw new Error('Curriculum manager not found');
    return result.rows[0].cm_id;
};

// ================= CREATE QUEST =================
const createQuest = async (req, res) => {
    const { quest_type, quest_number, quest_level, is_unlocked_by_default, passing_score } = req.body;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can create quests' });
        }

        if (!quest_type || !quest_number) {
            return res.status(400).json({ message: 'quest_type and quest_number are required' });
        }

        const validTypes = ['Reading', 'Writing', 'Speaking', 'Listening'];
        if (!validTypes.includes(quest_type)) {
            return res.status(400).json({ message: 'quest_type must be Reading, Writing, Speaking, or Listening' });
        }

        const cm_id = await getCmId(req.user.user_id);

        // Check if quest_number already exists for this type
        const existing = await pool.query(
            'SELECT * FROM quest WHERE quest_type = $1 AND quest_number = $2',
            [quest_type, quest_number]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ message: `${quest_type} Quest ${quest_number} already exists` });
        }

        const result = await pool.query(
            `INSERT INTO quest 
            (created_by, quest_type, quest_number, quest_level, is_unlocked_by_default, passing_score, is_published)
            VALUES ($1, $2, $3, $4, $5, $6, false)
            RETURNING *`,
            [cm_id, quest_type, quest_number, quest_level, is_unlocked_by_default || false, passing_score || 7]
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
    const { quest_type } = req.query;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can view all quests' });
        }

        let query = `
            SELECT q.*, 
                   u.first_name, u.last_name,
                   COUNT(ql.quest_level_id) as total_levels
            FROM quest q
            LEFT JOIN curriculum_manager cm ON q.created_by = cm.cm_id
            LEFT JOIN users u ON cm.user_id = u.user_id
            LEFT JOIN quest_level ql ON q.quest_id = ql.quest_id
        `;

        const params = [];

        if (quest_type) {
            query += ' WHERE q.quest_type = $1';
            params.push(quest_type);
        }

        query += ' GROUP BY q.quest_id, u.first_name, u.last_name ORDER BY q.quest_type, q.quest_number';

        const result = await pool.query(query, params);

        res.json({ quests: result.rows });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching quests', error: error.message });
    }
};

// ================= GET QUEST BY ID =================
const getQuestById = async (req, res) => {
    const { quest_id } = req.params;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can view quest details' });
        }

        const result = await pool.query(
            `SELECT q.*, u.first_name, u.last_name
             FROM quest q
             LEFT JOIN curriculum_manager cm ON q.created_by = cm.cm_id
             LEFT JOIN users u ON cm.user_id = u.user_id
             WHERE q.quest_id = $1`,
            [quest_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Quest not found' });
        }

        // Get levels
        const levels = await pool.query(
            `SELECT * FROM quest_level WHERE quest_id = $1 ORDER BY level_number`,
            [quest_id]
        );

        // Get materials
        const materials = await pool.query(
            `SELECT * FROM material WHERE quest_id = $1 ORDER BY created_at DESC`,
            [quest_id]
        );

        res.json({
            quest: result.rows[0],
            levels: levels.rows,
            materials: materials.rows
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching quest', error: error.message });
    }
};

// ================= GET QUESTS BY TYPE =================
const getQuestsByType = async (req, res) => {
    const { quest_type } = req.params;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can view quests' });
        }

        const validTypes = ['Reading', 'Writing', 'Speaking', 'Listening'];
        if (!validTypes.includes(quest_type)) {
            return res.status(400).json({ message: 'Invalid quest type' });
        }

        const result = await pool.query(
            `SELECT q.*, COUNT(ql.quest_level_id) as total_levels
             FROM quest q
             LEFT JOIN quest_level ql ON q.quest_id = ql.quest_id
             WHERE q.quest_type = $1
             GROUP BY q.quest_id
             ORDER BY q.quest_number`,
            [quest_type]
        );

        res.json({ quest_type, quests: result.rows });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching quests', error: error.message });
    }
};

// ================= UPDATE QUEST =================
const updateQuest = async (req, res) => {
    const { quest_id } = req.params;
    const { quest_type, quest_number, quest_level, is_unlocked_by_default, passing_score } = req.body;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can update quests' });
        }

        const cm_id = await getCmId(req.user.user_id);

        const questCheck = await pool.query(
            'SELECT * FROM quest WHERE quest_id = $1 AND created_by = $2',
            [quest_id, cm_id]
        );
        if (questCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Quest not found or unauthorized' });
        }

        const result = await pool.query(
            `UPDATE quest SET
                quest_type = COALESCE($1, quest_type),
                quest_number = COALESCE($2, quest_number),
                quest_level = COALESCE($3, quest_level),
                is_unlocked_by_default = COALESCE($4, is_unlocked_by_default),
                passing_score = COALESCE($5, passing_score)
             WHERE quest_id = $6
             RETURNING *`,
            [quest_type, quest_number, quest_level, is_unlocked_by_default, passing_score, quest_id]
        );

        res.json({
            message: 'Quest updated successfully',
            quest: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({ message: 'Error updating quest', error: error.message });
    }
};

// ================= PUBLISH / UNPUBLISH QUEST =================
const togglePublishQuest = async (req, res) => {
    const { quest_id } = req.params;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can publish quests' });
        }

        const cm_id = await getCmId(req.user.user_id);

        const questCheck = await pool.query(
            'SELECT * FROM quest WHERE quest_id = $1 AND created_by = $2',
            [quest_id, cm_id]
        );
        if (questCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Quest not found or unauthorized' });
        }

        const result = await pool.query(
            `UPDATE quest SET is_published = NOT is_published
             WHERE quest_id = $1
             RETURNING *`,
            [quest_id]
        );

        const status = result.rows[0].is_published ? 'published' : 'unpublished';

        res.json({
            message: `Quest ${status} successfully`,
            quest: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({ message: 'Error publishing quest', error: error.message });
    }
};

// ================= DELETE QUEST =================
const deleteQuest = async (req, res) => {
    const { quest_id } = req.params;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can delete quests' });
        }

        const cm_id = await getCmId(req.user.user_id);

        const questCheck = await pool.query(
            'SELECT * FROM quest WHERE quest_id = $1 AND created_by = $2',
            [quest_id, cm_id]
        );
        if (questCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Quest not found or unauthorized' });
        }

        await pool.query('DELETE FROM quest WHERE quest_id = $1', [quest_id]);

        res.json({ message: 'Quest deleted successfully' });

    } catch (error) {
        res.status(500).json({ message: 'Error deleting quest', error: error.message });
    }
};

module.exports = {
    createQuest,
    getAllQuests,
    getQuestById,
    getQuestsByType,
    updateQuest,
    togglePublishQuest,
    deleteQuest
};