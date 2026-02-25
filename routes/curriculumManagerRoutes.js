const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/curriculumManagerController');
const { authMiddleware, authorizeRoles } = require('../middleware/authMiddleware');

// ================= PROFILE =================
router.get('/profile', authMiddleware, authorizeRoles('curriculum_manager'), getProfile);
router.put('/profile', authMiddleware, authorizeRoles('curriculum_manager'), updateProfile);
router.put('/change-password', authMiddleware, authorizeRoles('curriculum_manager'), changePassword);

// ================= MATERIALS =================
router.post('/materials', authMiddleware, authorizeRoles('curriculum_manager'), createMaterial);
router.get('/materials', authMiddleware, authorizeRoles('curriculum_manager'), getAllMaterials);
router.get('/materials/:material_id', authMiddleware, authorizeRoles('curriculum_manager'), getMaterialById);
router.put('/materials/:material_id', authMiddleware, authorizeRoles('curriculum_manager'), updateMaterial);
router.delete('/materials/:material_id', authMiddleware, authorizeRoles('curriculum_manager'), deleteMaterial);

// ================= QUESTS =================
router.post('/quests', authMiddleware, authorizeRoles('curriculum_manager'), createQuest);
router.get('/quests', authMiddleware, authorizeRoles('curriculum_manager'), getAllQuests);
router.get('/quests/:quest_id', authMiddleware, authorizeRoles('curriculum_manager'), getQuestById);
router.put('/quests/:quest_id', authMiddleware, authorizeRoles('curriculum_manager'), updateQuest);
router.delete('/quests/:quest_id', authMiddleware, authorizeRoles('curriculum_manager'), deleteQuest);

module.exports = router;