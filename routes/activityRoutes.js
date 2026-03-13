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
    submitAnswer,
    finishActivity
} = require('../controllers/activityController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Question management (CM)
router.put('/questions/:question_id', authMiddleware, updateQuestion);
router.delete('/questions/:question_id', authMiddleware, deleteQuestion);

// Activity CRUD (CM)
router.post('/', authMiddleware, createActivity);
router.get('/', authMiddleware, getActivityByLevel);

// Specific routes FIRST before /:activity_id
router.post('/:activity_id/questions', authMiddleware, addQuestion);
router.get('/:activity_id/questions', authMiddleware, getActivityWithQuestions);

// Student routes
router.post('/:activity_id/questions/:question_id/answer', authMiddleware, submitAnswer);
router.post('/:activity_id/finish', authMiddleware, finishActivity);

// General activity routes
router.put('/:activity_id', authMiddleware, updateActivity);
router.delete('/:activity_id', authMiddleware, deleteActivity);

module.exports = router;