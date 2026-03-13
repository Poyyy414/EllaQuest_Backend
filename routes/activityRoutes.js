const express = require('express');
const router = express.Router({ mergeParams: true });
const {
    createActivity,
    getActivityByLevel,
    getActivityWithQuestions,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    updateActivity,
    deleteActivity,
    submitActivity
} = require('../controllers/activityController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Activity routes (nested under quest level)
router.post('/', authMiddleware, createActivity);
router.get('/', authMiddleware, getActivityByLevel);

// Specific routes FIRST
router.post('/:activity_id/questions', authMiddleware, addQuestion);
router.post('/:activity_id/submit', authMiddleware, submitActivity);
router.get('/:activity_id/questions', authMiddleware, getActivityWithQuestions);

// General activity routes
router.put('/:activity_id', authMiddleware, updateActivity);
router.delete('/:activity_id', authMiddleware, deleteActivity);

// Question routes
router.put('/questions/:question_id', authMiddleware, updateQuestion);
router.delete('/questions/:question_id', authMiddleware, deleteQuestion);

module.exports = router;