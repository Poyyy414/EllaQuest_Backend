const express = require('express');
const router = express.Router();
const {
    getProfile,
    updateProfile,
    changePassword,
    getEnrolledCourses,
    getMySection,
    getMySectionById,
    getAllPublishedQuests,
    getQuestById
} = require('../controllers/studentController');

const { authMiddleware, authorizeRoles } = require('../middleware/authMiddleware');

// ================= PROFILE =================
router.get('/student/profile', authMiddleware, authorizeRoles('student'), getProfile);
router.put('/student/profile', authMiddleware, authorizeRoles('student'), updateProfile);
router.put('/student/change-password', authMiddleware, authorizeRoles('student'), changePassword);
router.get('/student/courses', authMiddleware, authorizeRoles('student'), getEnrolledCourses);

// ================= SECTIONS =================
router.get('/student/my-section', authMiddleware, authorizeRoles('student'), getMySection);
router.get('/student/my-section/:section_id', authMiddleware, authorizeRoles('student'), getMySectionById);

// ================= QUESTS =================
router.get('/student/quests', authMiddleware, authorizeRoles('student'), getAllPublishedQuests);
router.get('/student/quests/:quest_id', authMiddleware, authorizeRoles('student'), getQuestById);

module.exports = router;