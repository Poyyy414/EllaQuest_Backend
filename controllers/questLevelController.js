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

// ================= HELPER: CHECK QUEST OWNERSHIP =================
const checkQuestOwnership = async (quest_id, cm_id) => {
    const result = await pool.query(
        'SELECT * FROM quest WHERE quest_id = $1 AND created_by = $2',
        [quest_id, cm_id]
    );
    if (result.rows.length === 0) throw new Error('Quest not found or unauthorized');
    return result.rows[0];
};

// ================= CREATE QUEST LEVEL =================
const createQuestLevel = async (req, res) => {
    const { quest_id } = req.params;
    const { level_number } = req.body;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can create quest levels' });
        }

        if (!level_number) {
            return res.status(400).json({ message: 'level_number is required' });
        }

        const cm_id = await getCmId(req.user.user_id);
        await checkQuestOwnership(quest_id, cm_id);

        // Check if level_number already exists for this quest
        const existing = await pool.query(
            'SELECT * FROM quest_level WHERE quest_id = $1 AND level_number = $2',
            [quest_id, level_number]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ message: `Level ${level_number} already exists for this quest` });
        }

        // Level 1 is unlocked by default, rest are locked
        const is_locked = level_number === 1 ? false : true;

        const result = await pool.query(
            `INSERT INTO quest_level (quest_id, level_number, is_locked)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [quest_id, level_number, is_locked]
        );

        res.status(201).json({
            message: 'Quest level created successfully',
            quest_level: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({ message: 'Error creating quest level', error: error.message });
    }
};

// ================= GET ALL LEVELS BY QUEST =================
const getLevelsByQuest = async (req, res) => {
    const { quest_id } = req.params;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can view quest levels' });
        }

        const cm_id = await getCmId(req.user.user_id);
        await checkQuestOwnership(quest_id, cm_id);

        const result = await pool.query(
            `SELECT ql.*,
                    COUNT(DISTINCT a.activity_id) as has_activity,
                    COUNT(DISTINCT q.quiz_id) as has_quiz
             FROM quest_level ql
             LEFT JOIN activity a ON ql.quest_level_id = a.quest_level_id
             LEFT JOIN quiz q ON ql.quest_level_id = q.quest_level_id
             WHERE ql.quest_id = $1
             GROUP BY ql.quest_level_id
             ORDER BY ql.level_number`,
            [quest_id]
        );

        res.json({ quest_levels: result.rows });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching quest levels', error: error.message });
    }
};

// ================= GET LEVEL BY ID =================
const getLevelById = async (req, res) => {
    const { quest_id, quest_level_id } = req.params;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can view quest level details' });
        }

        const cm_id = await getCmId(req.user.user_id);
        await checkQuestOwnership(quest_id, cm_id);

        const result = await pool.query(
            `SELECT * FROM quest_level 
             WHERE quest_level_id = $1 AND quest_id = $2`,
            [quest_level_id, quest_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Quest level not found' });
        }

        // Get activity
        const activity = await pool.query(
            `SELECT a.*, COUNT(aq.question_id) as total_questions
             FROM activity a
             LEFT JOIN activity_question aq ON a.activity_id = aq.activity_id
             WHERE a.quest_level_id = $1
             GROUP BY a.activity_id`,
            [quest_level_id]
        );

        // Get quiz
        const quiz = await pool.query(
            `SELECT q.*, COUNT(qq.question_id) as total_questions
             FROM quiz q
             LEFT JOIN quiz_question qq ON q.quiz_id = qq.quiz_id
             WHERE q.quest_level_id = $1
             GROUP BY q.quiz_id`,
            [quest_level_id]
        );

        res.json({
            quest_level: result.rows[0],
            activity: activity.rows[0] || null,
            quiz: quiz.rows[0] || null
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching quest level', error: error.message });
    }
};

// ================= UPDATE QUEST LEVEL =================
const updateQuestLevel = async (req, res) => {
    const { quest_id, quest_level_id } = req.params;
    const { level_number, is_locked } = req.body;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can update quest levels' });
        }

        const cm_id = await getCmId(req.user.user_id);
        await checkQuestOwnership(quest_id, cm_id);

        const levelCheck = await pool.query(
            'SELECT * FROM quest_level WHERE quest_level_id = $1 AND quest_id = $2',
            [quest_level_id, quest_id]
        );
        if (levelCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Quest level not found' });
        }

        const result = await pool.query(
            `UPDATE quest_level SET
                level_number = COALESCE($1, level_number),
                is_locked = COALESCE($2, is_locked)
             WHERE quest_level_id = $3
             RETURNING *`,
            [level_number, is_locked, quest_level_id]
        );

        res.json({
            message: 'Quest level updated successfully',
            quest_level: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({ message: 'Error updating quest level', error: error.message });
    }
};

// ================= DELETE QUEST LEVEL =================
const deleteQuestLevel = async (req, res) => {
    const { quest_id, quest_level_id } = req.params;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can delete quest levels' });
        }

        const cm_id = await getCmId(req.user.user_id);
        await checkQuestOwnership(quest_id, cm_id);

        const levelCheck = await pool.query(
            'SELECT * FROM quest_level WHERE quest_level_id = $1 AND quest_id = $2',
            [quest_level_id, quest_id]
        );
        if (levelCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Quest level not found' });
        }

        await pool.query('DELETE FROM quest_level WHERE quest_level_id = $1', [quest_level_id]);

        res.json({ message: 'Quest level deleted successfully' });

    } catch (error) {
        res.status(500).json({ message: 'Error deleting quest level', error: error.message });
    }
};

module.exports = {
    createQuestLevel,
    getLevelsByQuest,
    getLevelById,
    updateQuestLevel,
    deleteQuestLevel
};