const express = require('express');
const router = express.Router();
const {
    createCourse,
    getMyCourses,
    getCourseById,
    updateCourse,
    deleteCourse
} = require('../controllers/courseController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Specific routes first
router.get('/my-courses', authMiddleware, getMyCourses);

// General routes
router.post('/', authMiddleware, createCourse);
router.get('/:course_id', authMiddleware, getCourseById);
router.put('/:course_id', authMiddleware, updateCourse);
router.delete('/:course_id', authMiddleware, deleteCourse);

module.exports = router;