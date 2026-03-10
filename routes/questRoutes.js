const express = require('express');
const router = express.Router();
const { 
    createQuest,
    getAllQuests,
    getQuestById,
    getQuestsByMacroSkill,
    updateQuest,
    togglePublishQuest,
    deleteQuest,
    getMacroSkills,
    createMacroSkill
} = require('../controllers/questController');
const { authMiddleware } = require('../middleware/authMiddleware');

// ================= MACRO SKILLS =================
// ⚠️ Specific routes MUST come before dynamic /:quest_id routes
router.get('/macro-skills', authMiddleware, getMacroSkills);
router.post('/macro-skills', authMiddleware, createMacroSkill);
router.get('/macro-skill/:macro_skill_id', authMiddleware, getQuestsByMacroSkill);

// ================= QUESTS =================
router.post('/', authMiddleware, createQuest);
router.get('/', authMiddleware, getAllQuests);
router.get('/:quest_id', authMiddleware, getQuestById);        // ✅ dynamic route LAST
router.put('/:quest_id', authMiddleware, updateQuest);
router.patch('/:quest_id/publish', authMiddleware, togglePublishQuest);
router.delete('/:quest_id', authMiddleware, deleteQuest);

module.exports = router;