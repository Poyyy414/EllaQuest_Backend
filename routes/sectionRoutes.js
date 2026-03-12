const express = require('express');
const router = express.Router({ mergeParams: true });
const {
    createSection,
    getSectionsByCourse,
    getSectionById,
    updateSection,
    deleteSection,
    updateStudentStatus,
    getPendingStudents,
    joinSection
} = require('../controllers/sectionController');
const { authMiddleware } = require('../middleware/authMiddleware');

// ✅ Specific routes FIRST
router.post('/join', authMiddleware, joinSection);

// Section CRUD
router.post('/', authMiddleware, createSection);
router.get('/', authMiddleware, getSectionsByCourse);

// ✅ Specific nested routes BEFORE /:section_id
router.get('/:section_id/pending', authMiddleware, getPendingStudents);
router.put('/:section_id/students/:ss_id', authMiddleware, updateStudentStatus);

// ✅ Dynamic routes LAST
router.get('/:section_id', authMiddleware, getSectionById);
router.put('/:section_id', authMiddleware, updateSection);
router.delete('/:section_id', authMiddleware, deleteSection);

module.exports = router;