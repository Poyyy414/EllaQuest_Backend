const pool = require('../config/database');

// ================= CREATE QUEST =================
const createQuest = async (req, res) => {
    const { macro_skill_id, quest_number, quest_level, passing_score, is_unlocked_by_default } = req.body;
    const created_by = req.user.user_id; // from JWT middleware

    try {
        // Only curriculum manager can create quest
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can create quests' });
        }

        // Check if macro_skill exists
        const skillCheck = await pool.query(
            'SELECT * FROM macro_skill WHERE macro_skill_id = $1', [macro_skill_id]
        );
        if (skillCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Macro skill not found' });
        }

        // Check if quest_number already exists for this macro_skill
        const duplicate = await pool.query(
            'SELECT * FROM quest WHERE macro_skill_id = $1 AND quest_number = $2',
            [macro_skill_id, quest_number]
        );
        if (duplicate.rows.length > 0) {
            return res.status(400).json({ message: 'Quest number already exists for this skill' });
        }

        const result = await pool.query(
            `INSERT INTO quest 
            (created_by, macro_skill_id, quest_number, quest_level, passing_score, is_unlocked_by_default, is_published, submitted_at) 
            VALUES ($1, $2, $3, $4, $5, $6, false, NOW()) 
            RETURNING *`,
            [created_by, macro_skill_id, quest_number, quest_level, passing_score, is_unlocked_by_default ?? false]
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
            `SELECT q.*, ms.skill_name, ms.description as skill_description, ms.icon_url,
                    u.first_name, u.last_name
             FROM quest q
             JOIN macro_skill ms ON q.macro_skill_id = ms.macro_skill_id
             JOIN users u ON q.created_by = u.user_id
             ORDER BY q.macro_skill_id, q.quest_number`
        );

        res.json({ quests: result.rows });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching quests', error: error.message });
    }
};

// ================= GET QUEST BY ID =================
const getQuestById = async (req, res) => {
    const { quest_id } = req.params;

    try {
        const result = await pool.query(
            `SELECT q.*, ms.skill_name, ms.description as skill_description, ms.icon_url,
                    u.first_name, u.last_name
             FROM quest q
             JOIN macro_skill ms ON q.macro_skill_id = ms.macro_skill_id
             JOIN users u ON q.created_by = u.user_id
             WHERE q.quest_id = $1`,
            [quest_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Quest not found' });
        }

        // Get quest levels
        const levels = await pool.query(
            'SELECT * FROM quest_level WHERE quest_id = $1 ORDER BY level_number',
            [quest_id]
        );

        // Get materials
        const materials = await pool.query(
            'SELECT * FROM material WHERE quest_id = $1',
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

// ================= GET QUESTS BY MACRO SKILL =================
const getQuestsByMacroSkill = async (req, res) => {
    const { macro_skill_id } = req.params;

    try {
        const result = await pool.query(
            `SELECT q.*, ms.skill_name, ms.icon_url
             FROM quest q
             JOIN macro_skill ms ON q.macro_skill_id = ms.macro_skill_id
             WHERE q.macro_skill_id = $1
             ORDER BY q.quest_number`,
            [macro_skill_id]
        );

        res.json({ quests: result.rows });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching quests', error: error.message });
    }
};

// ================= UPDATE QUEST =================
const updateQuest = async (req, res) => {
    const { quest_id } = req.params;
    const { quest_number, quest_level, passing_score, is_unlocked_by_default, is_published } = req.body;

    try {
        // Only curriculum manager can update
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can update quests' });
        }

        // Check if quest exists
        const questCheck = await pool.query(
            'SELECT * FROM quest WHERE quest_id = $1', [quest_id]
        );
        if (questCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Quest not found' });
        }

        const result = await pool.query(
            `UPDATE quest SET
                quest_number = COALESCE($1, quest_number),
                quest_level = COALESCE($2, quest_level),
                passing_score = COALESCE($3, passing_score),
                is_unlocked_by_default = COALESCE($4, is_unlocked_by_default),
                is_published = COALESCE($5, is_published)
             WHERE quest_id = $6
             RETURNING *`,
            [quest_number, quest_level, passing_score, is_unlocked_by_default, is_published, quest_id]
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

        const questCheck = await pool.query(
            'SELECT * FROM quest WHERE quest_id = $1', [quest_id]
        );
        if (questCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Quest not found' });
        }

        const current = questCheck.rows[0].is_published;

        const result = await pool.query(
            'UPDATE quest SET is_published = $1 WHERE quest_id = $2 RETURNING *',
            [!current, quest_id]
        );

        res.json({ 
            message: `Quest ${!current ? 'published' : 'unpublished'} successfully`,
            quest: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({ message: 'Error toggling quest publish', error: error.message });
    }
};

// ================= DELETE QUEST =================
const deleteQuest = async (req, res) => {
    const { quest_id } = req.params;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can delete quests' });
        }

        const questCheck = await pool.query(
            'SELECT * FROM quest WHERE quest_id = $1', [quest_id]
        );
        if (questCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Quest not found' });
        }

        await pool.query('DELETE FROM quest WHERE quest_id = $1', [quest_id]);

        res.json({ message: 'Quest deleted successfully' });

    } catch (error) {
        res.status(500).json({ message: 'Error deleting quest', error: error.message });
    }
};

// ================= GET ALL MACRO SKILLS =================
const getMacroSkills = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM macro_skill ORDER BY skill_name'
        );
        res.json({ macro_skills: result.rows });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching macro skills', error: error.message });
    }
};

// ================= CREATE MACRO SKILL =================
const createMacroSkill = async (req, res) => {
    const { skill_name, description, icon_url } = req.body;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can create macro skills' });
        }

        const result = await pool.query(
            'INSERT INTO macro_skill (skill_name, description, icon_url) VALUES ($1, $2, $3) RETURNING *',
            [skill_name, description, icon_url]
        );

        res.status(201).json({ 
            message: 'Macro skill created successfully', 
            macro_skill: result.rows[0] 
        });

    } catch (error) {
        res.status(500).json({ message: 'Error creating macro skill', error: error.message });
    }
};

// ================= EXPORT =================
module.exports = {
    createQuest,
    getAllQuests,
    getQuestById,
    getQuestsByMacroSkill,
    updateQuest,
    togglePublishQuest,
    deleteQuest,
    getMacroSkills,
    createMacroSkill
};