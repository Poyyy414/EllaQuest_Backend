const express = require('express');
const router = express.Router();
const {
    getProfile,
    updateProfile,
    changePassword,
    getAssignedCourses,
    getStudentsInCourse,
    getMySections,
    getMySectionById
} = require('../controllers/instructorController');
const { authMiddleware, authorizeRoles } = require('../middleware/authMiddleware');

// All routes require authentication and instructor role
router.get('/instructor/profile', authMiddleware, authorizeRoles('instructor'), getProfile);
router.put('/instructor/profile', authMiddleware, authorizeRoles('instructor'), updateProfile);
router.put('/instructor/change-password', authMiddleware, authorizeRoles('instructor'), changePassword);
router.get('/instructor/courses', authMiddleware, authorizeRoles('instructor'), getAssignedCourses);
router.get('/instructor/courses/:course_id/students', authMiddleware, authorizeRoles('instructor'), getStudentsInCourse);
router.get('/instructor/my-sections', authMiddleware, authorizeRoles('instructor'), getMySections);
router.get('/instructor/my-sections/:section_id', authMiddleware, authorizeRoles('instructor'), getMySectionById);

module.exports = router;