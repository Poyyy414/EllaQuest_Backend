const express = require('express');
const router = express.Router({ mergeParams: true });
const {
    createQuiz,
    getQuizByLevel,
    getQuizWithQuestions,
    getNextQuestion,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    updateQuiz,
    deleteQuiz,
    submitAnswer,
    finishQuiz
} = require('../controllers/quizController');
const { authMiddleware } = require('../middleware/authMiddleware');

// CM question management
router.put('/questions/:question_id', authMiddleware, updateQuestion);
router.delete('/questions/:question_id', authMiddleware, deleteQuestion);

// Quiz CRUD
router.post('/', authMiddleware, createQuiz);
router.get('/', authMiddleware, getQuizByLevel);

// Specific routes BEFORE /:quiz_id
router.post('/:quiz_id/questions', authMiddleware, addQuestion);
router.get('/:quiz_id/questions', authMiddleware, getQuizWithQuestions);     // CM only
router.get('/:quiz_id/next-question', authMiddleware, getNextQuestion);       // Student
router.post('/:quiz_id/questions/:question_id/answer', authMiddleware, submitAnswer); // Student
router.post('/:quiz_id/finish', authMiddleware, finishQuiz);                  // Student

// General
router.put('/:quiz_id', authMiddleware, updateQuiz);
router.delete('/:quiz_id', authMiddleware, deleteQuiz);

module.exports = router;