const express = require('express');
const router = express.Router({ mergeParams: true });
const {
    createSection,
    getSectionsByCourse,
    getSectionById,
    updateSection,
    deleteSection,
    updateStudentStatus,
    getPendingStudents
} = require('../controllers/sectionController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Section CRUD (nested under course)
router.post('/', authMiddleware, createSection);
router.get('/', authMiddleware, getSectionsByCourse);
router.get('/:section_id', authMiddleware, getSectionById);
router.put('/:section_id', authMiddleware, updateSection);
router.delete('/:section_id', authMiddleware, deleteSection);

// Student management
router.get('/:section_id/pending', authMiddleware, getPendingStudents);
router.put('/:section_id/students/:ss_id', authMiddleware, updateStudentStatus);

module.exports = router;