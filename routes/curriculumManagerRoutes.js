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
router.get('/curriculum-manager/profile', authMiddleware, authorizeRoles('curriculum_manager'), getProfile);
router.put('/curriculum-manager/profile', authMiddleware, authorizeRoles('curriculum_manager'), updateProfile);
router.put('/curriculum-manager/change-password', authMiddleware, authorizeRoles('curriculum_manager'), changePassword);

// ================= MATERIALS =================
router.post('/curriculum-manager/create/materials', authMiddleware, authorizeRoles('curriculum_manager'), createMaterial);
router.get('/curriculum-manager/materials', authMiddleware, authorizeRoles('curriculum_manager'), getAllMaterials);
router.get('/curriculum-manager/materials/:material_id', authMiddleware, authorizeRoles('curriculum_manager'), getMaterialById);
router.put('/curriculum-manager/materials/:material_id', authMiddleware, authorizeRoles('curriculum_manager'), updateMaterial);
router.delete('/curriculum-manager/materials/:material_id', authMiddleware, authorizeRoles('curriculum_manager'), deleteMaterial);

// ================= QUESTS =================
router.post('/curriculum-manager/create/quests', authMiddleware, authorizeRoles('curriculum_manager'), createQuest);
router.get('/curriculum-manager/quests', authMiddleware, authorizeRoles('curriculum_manager'), getAllQuests);
router.get('/curriculum-manager/quests/:quest_id', authMiddleware, authorizeRoles('curriculum_manager'), getQuestById);
router.put('/curriculum-manager/quests/:quest_id', authMiddleware, authorizeRoles('curriculum_manager'), updateQuest);
router.delete('/curriculum-manager/quests/:quest_id', authMiddleware, authorizeRoles('curriculum_manager'), deleteQuest);

module.exports = router;