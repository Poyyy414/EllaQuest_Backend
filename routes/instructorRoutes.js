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
router.get('/instructor/profile', authMiddleware, authorizeRoles('instructor'), getProfile);
router.put('/instructor/profile', authMiddleware, authorizeRoles('instructor'), updateProfile);
router.put('/instructor/change-password', authMiddleware, authorizeRoles('instructor'), changePassword);
router.get('/instructor/courses', authMiddleware, authorizeRoles('instructor'), getAssignedCourses);
router.get('/instructor/courses/:course_id/students', authMiddleware, authorizeRoles('instructor'), getStudentsInCourse);

module.exports = router;