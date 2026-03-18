const express = require('express');
const router = express.Router();
const {
    getProfile,
    updateProfile,
    changePassword,
    getEnrolledCourses,
    getMySection,
    getMySectionById
} = require('../controllers/studentController');

const { authMiddleware, authorizeRoles } = require('../middleware/authMiddleware');

router.get('/student/profile', authMiddleware, authorizeRoles('student'), getProfile);
router.put('/student/profile', authMiddleware, authorizeRoles('student'), updateProfile);
router.put('/student/change-password', authMiddleware, authorizeRoles('student'), changePassword);
router.get('/student/courses', authMiddleware, authorizeRoles('student'), getEnrolledCourses);
router.get('/student/my-section', authMiddleware, authorizeRoles('student'), getMySection);
router.get('/student/my-section/:section_id', authMiddleware, authorizeRoles('student'), getMySectionById);

module.exports = router;