const express = require('express');
const router = express.Router({ mergeParams: true });
const {
    createQuestLevel,
    getLevelsByQuest,
    getLevelById,
    updateQuestLevel,
    deleteQuestLevel
} = require('../controllers/questLevelController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.post('/', authMiddleware, createQuestLevel);
router.get('/', authMiddleware, getLevelsByQuest);
router.get('/:quest_level_id', authMiddleware, getLevelById);
router.put('/:quest_level_id', authMiddleware, updateQuestLevel);
router.delete('/:quest_level_id', authMiddleware, deleteQuestLevel);

module.exports = router;