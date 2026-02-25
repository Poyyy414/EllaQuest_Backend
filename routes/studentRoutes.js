const express = require('express');
const router = express.Router();
const {
    getProfile,
    updateProfile,
    changePassword,
    getEnrolledCourses
} = require('../controllers/studentController');


const { authMiddleware, authorizeRoles } = require('../middleware/authMiddleware');

router.get('/profile', authMiddleware, authorizeRoles('student'), getProfile);
router.put('/profile', authMiddleware, authorizeRoles('student'), updateProfile);
router.put('/change-password', authMiddleware, authorizeRoles('student'), changePassword);
router.get('/courses', authMiddleware, authorizeRoles('student'), getEnrolledCourses);
module.exports = router;