const express = require('express');
const router = express.Router({ mergeParams: true });
const {
    createActivity,
    getActivityByLevel,
    getActivityWithQuestions,
    getNextQuestion,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    updateActivity,
    deleteActivity,
    submitAnswer,
    finishActivity
} = require('../controllers/activityController');
const { authMiddleware } = require('../middleware/authMiddleware');

// CM question management
router.put('/questions/:question_id', authMiddleware, updateQuestion);
router.delete('/questions/:question_id', authMiddleware, deleteQuestion);

// Activity CRUD
router.post('/', authMiddleware, createActivity);
router.get('/', authMiddleware, getActivityByLevel);

// Specific routes BEFORE /:activity_id
router.post('/:activity_id/questions', authMiddleware, addQuestion);
router.get('/:activity_id/questions', authMiddleware, getActivityWithQuestions);  // CM only
router.get('/:activity_id/next-question', authMiddleware, getNextQuestion);        // Student
router.post('/:activity_id/questions/:question_id/answer', authMiddleware, submitAnswer); // Student
router.post('/:activity_id/finish', authMiddleware, finishActivity);               // Student

// General
router.put('/:activity_id', authMiddleware, updateActivity);
router.delete('/:activity_id', authMiddleware, deleteActivity);

module.exports = router;