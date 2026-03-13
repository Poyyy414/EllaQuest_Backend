const express = require('express');
const router = express.Router();
const {
    createQuest,
    getAllQuests,
    getQuestById,
    getQuestsByType,
    updateQuest,
    togglePublishQuest,
    deleteQuest
} = require('../controllers/questController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Specific routes FIRST
router.get('/type/:quest_type', authMiddleware, getQuestsByType);
router.put('/:quest_id/publish', authMiddleware, togglePublishQuest);

// General routes
router.post('/', authMiddleware, createQuest);
router.get('/', authMiddleware, getAllQuests);
router.get('/:quest_id', authMiddleware, getQuestById);
router.put('/:quest_id', authMiddleware, updateQuest);
router.delete('/:quest_id', authMiddleware, deleteQuest);

module.exports = router;