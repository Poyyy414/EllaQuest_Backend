const express = require('express');
const router = express.Router();
const {
    getProfile,
    updateProfile,
    changePassword,
    getAssignedCourses,
    getStudentsInCourse
} = require('../controllers/instructorController');
const { authMiddleware, authorizeRoles } = require('../middleware/authMiddleware');

// All routes require authentication and instructor role
router.get('/profile', authMiddleware, authorizeRoles('instructor'), getProfile);
router.put('/profile', authMiddleware, authorizeRoles('instructor'), updateProfile);
router.put('/change-password', authMiddleware, authorizeRoles('instructor'), changePassword);
router.get('/courses', authMiddleware, authorizeRoles('instructor'), getAssignedCourses);
router.get('/courses/:course_id/students', authMiddleware, authorizeRoles('instructor'), getStudentsInCourse);

module.exports = router;