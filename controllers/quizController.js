const pool = require('../config/database');

// ================= HELPER: GET STUDENT ID =================
const getStudentId = async (user_id) => {
    const result = await pool.query(
        'SELECT student_id FROM student WHERE user_id = $1',
        [user_id]
    );
    if (result.rows.length === 0) throw new Error('Student not found');
    return result.rows[0].student_id;
};

// ================= CREATE QUIZ =================
const createQuiz = async (req, res) => {
    const { quest_level_id } = req.params;
    const { title, passing_score, max_attempts, time_limit_sec } = req.body;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can create quizzes' });
        }

        const existing = await pool.query(
            'SELECT * FROM quiz WHERE quest_level_id = $1',
            [quest_level_id]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ message: 'Quiz already exists for this level' });
        }

        const result = await pool.query(
            `INSERT INTO quiz (quest_level_id, title, game_type, passing_score, max_attempts, time_limit_sec, is_locked)
             VALUES ($1, $2, 'mixed', $3, $4, $5, true)
             RETURNING *`,
            [quest_level_id, title, passing_score || 7, max_attempts || 3, time_limit_sec || null]
        );

        res.status(201).json({
            message: 'Quiz created successfully',
            quiz: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({ message: 'Error creating quiz', error: error.message });
    }
};

// ================= GET QUIZ BY LEVEL =================
const getQuizByLevel = async (req, res) => {
    const { quest_level_id } = req.params;

    try {
        const result = await pool.query(
            `SELECT q.*, COUNT(qq.quiz_question_id) as total_questions
             FROM quiz q
             LEFT JOIN quiz_question qq ON q.quiz_id = qq.quiz_id
             WHERE q.quest_level_id = $1
             GROUP BY q.quiz_id`,
            [quest_level_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No quiz found for this level' });
        }

        res.json({ quiz: result.rows[0] });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching quiz', error: error.message });
    }
};

// ================= GET ALL QUESTIONS (CM only) =================
const getQuizWithQuestions = async (req, res) => {
    const { quiz_id } = req.params;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can view all questions' });
        }

        const quizResult = await pool.query(
            'SELECT * FROM quiz WHERE quiz_id = $1',
            [quiz_id]
        );
        if (quizResult.rows.length === 0) {
            return res.status(404).json({ message: 'Quiz not found' });
        }

        const questions = await pool.query(
            `SELECT qq.quiz_question_id, qq.question_text, qq.question_type,
                    qq.points, qq.media_url, qq.order_index,
                    json_agg(
                        json_build_object(
                            'quiz_answer_id', qa.quiz_answer_id,
                            'answer_text', qa.answer_text,
                            'is_correct', qa.is_correct,
                            'order_index', qa.order_index
                        ) ORDER BY qa.order_index
                    ) as answers
             FROM quiz_question qq
             LEFT JOIN quiz_answer qa ON qq.quiz_question_id = qa.question_id
             WHERE qq.quiz_id = $1
             GROUP BY qq.quiz_question_id
             ORDER BY qq.order_index`,
            [quiz_id]
        );

        res.json({
            quiz: quizResult.rows[0],
            questions: questions.rows
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching quiz questions', error: error.message });
    }
};

// ================= GET NEXT QUESTION (Student) =================
const getNextQuestion = async (req, res) => {
    const { quiz_id } = req.params;

    try {
        if (req.user.role !== 'student') {
            return res.status(403).json({ message: 'Only students can take quizzes' });
        }

        const student_id = await getStudentId(req.user.user_id);

        const quizResult = await pool.query(
            'SELECT * FROM quiz WHERE quiz_id = $1',
            [quiz_id]
        );
        if (quizResult.rows.length === 0) {
            return res.status(404).json({ message: 'Quiz not found' });
        }
        const quiz = quizResult.rows[0];

        if (quiz.is_locked) {
            return res.status(403).json({ message: 'Quiz is locked! Pass the activity first.' });
        }

        const totalResult = await pool.query(
            'SELECT COUNT(*) as total FROM quiz_question WHERE quiz_id = $1',
            [quiz_id]
        );
        const total_questions = Math.min(parseInt(totalResult.rows[0].total), 10);

        const answeredResult = await pool.query(
            `SELECT question_id FROM student_quiz_answer
             WHERE student_id = $1 AND quiz_id = $2`,
            [student_id, quiz_id]
        );
        const answeredIds = answeredResult.rows.map(r => r.question_id);
        const answered_count = answeredIds.length;

        if (answered_count >= total_questions) {
            return res.json({
                message: 'All questions answered! Click finish to see your score.',
                completed: true,
                answered_count,
                total_questions
            });
        }

        let nextQuestion;
        if (answeredIds.length > 0) {
            nextQuestion = await pool.query(
                `SELECT qq.quiz_question_id, qq.question_text, qq.question_type,
                        qq.points, qq.media_url, qq.order_index,
                        CASE 
                            WHEN qq.question_type IN ('identification', 'fill_in_blank') 
                            THEN '[]'::json
                            ELSE json_agg(
                                json_build_object(
                                    'quiz_answer_id', qa.quiz_answer_id,
                                    'answer_text', qa.answer_text,
                                    'order_index', qa.order_index
                                ) ORDER BY RANDOM()
                            )
                        END as answers
                 FROM quiz_question qq
                 LEFT JOIN quiz_answer qa ON qq.quiz_question_id = qa.question_id
                 WHERE qq.quiz_id = $1
                 AND qq.quiz_question_id NOT IN (${answeredIds.join(',')})
                 GROUP BY qq.quiz_question_id
                 ORDER BY RANDOM()
                 LIMIT 1`,
                [quiz_id]
            );
        } else {
            nextQuestion = await pool.query(
                `SELECT qq.quiz_question_id, qq.question_text, qq.question_type,
                        qq.points, qq.media_url, qq.order_index,
                        CASE 
                            WHEN qq.question_type IN ('identification', 'fill_in_blank') 
                            THEN '[]'::json
                            ELSE json_agg(
                                json_build_object(
                                    'quiz_answer_id', qa.quiz_answer_id,
                                    'answer_text', qa.answer_text,
                                    'order_index', qa.order_index
                                ) ORDER BY RANDOM()
                            )
                        END as answers
                 FROM quiz_question qq
                 LEFT JOIN quiz_answer qa ON qq.quiz_question_id = qa.question_id
                 WHERE qq.quiz_id = $1
                 GROUP BY qq.quiz_question_id
                 ORDER BY RANDOM()
                 LIMIT 1`,
                [quiz_id]
            );
        }

        if (nextQuestion.rows.length === 0) {
            return res.json({
                message: 'All questions answered! Click finish to see your score.',
                completed: true,
                answered_count,
                total_questions
            });
        }

        res.json({
            question: nextQuestion.rows[0],
            answered_count,
            total_questions,
            completed: false
        });

    } catch (error) {
        res.status(500).json({ message: 'Error getting next question', error: error.message });
    }
};

// ================= ADD QUESTION TO QUIZ =================
const addQuestion = async (req, res) => {
    const { quiz_id } = req.params;
    const { question_text, question_type, points, media_url, order_index, answers } = req.body;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can add questions' });
        }

        if (!question_text || !question_type) {
            return res.status(400).json({ message: 'question_text and question_type are required' });
        }

        const validTypes = ['multiple_choice', 'true_false', 'identification', 'fill_in_blank'];
        if (!validTypes.includes(question_type)) {
            return res.status(400).json({
                message: 'question_type must be multiple_choice, true_false, identification, or fill_in_blank'
            });
        }

        const minAnswers = ['identification', 'fill_in_blank'].includes(question_type) ? 1 : 2;
        if (!answers || answers.length < minAnswers) {
            return res.status(400).json({
                message: `At least ${minAnswers} answer(s) required for ${question_type}`
            });
        }

        const hasCorrectAnswer = answers.some(a => a.is_correct === true);
        if (!hasCorrectAnswer) {
            return res.status(400).json({ message: 'At least one answer must be correct' });
        }

        const quizCheck = await pool.query(
            'SELECT * FROM quiz WHERE quiz_id = $1',
            [quiz_id]
        );
        if (quizCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Quiz not found' });
        }

        const questionResult = await pool.query(
            `INSERT INTO quiz_question (quiz_id, question_text, question_type, points, media_url, order_index)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [quiz_id, question_text, question_type, points || 1, media_url, order_index]
        );
        const quiz_question_id = questionResult.rows[0].quiz_question_id;

        const insertedAnswers = [];
        for (const answer of answers) {
            const answerResult = await pool.query(
                `INSERT INTO quiz_answer (question_id, quiz_id, answer_text, is_correct, order_index)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`,
                [quiz_question_id, quiz_id, answer.answer_text, answer.is_correct, answer.order_index]
            );
            insertedAnswers.push(answerResult.rows[0]);
        }

        res.status(201).json({
            message: 'Question added successfully',
            question: questionResult.rows[0],
            answers: insertedAnswers
        });

    } catch (error) {
        res.status(500).json({ message: 'Error adding question', error: error.message });
    }
};

// ================= UPDATE QUESTION =================
const updateQuestion = async (req, res) => {
    const { question_id } = req.params;
    const { question_text, question_type, points, media_url, order_index } = req.body;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can update questions' });
        }

        const result = await pool.query(
            `UPDATE quiz_question SET
                question_text = COALESCE($1, question_text),
                question_type = COALESCE($2, question_type),
                points = COALESCE($3, points),
                media_url = COALESCE($4, media_url),
                order_index = COALESCE($5, order_index)
             WHERE quiz_question_id = $6
             RETURNING *`,
            [question_text, question_type, points, media_url, order_index, question_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Question not found' });
        }

        res.json({ message: 'Question updated successfully', question: result.rows[0] });

    } catch (error) {
        res.status(500).json({ message: 'Error updating question', error: error.message });
    }
};

// ================= DELETE QUESTION =================
const deleteQuestion = async (req, res) => {
    const { question_id } = req.params;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can delete questions' });
        }

        const result = await pool.query(
            'DELETE FROM quiz_question WHERE quiz_question_id = $1 RETURNING *',
            [question_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Question not found' });
        }

        res.json({ message: 'Question deleted successfully' });

    } catch (error) {
        res.status(500).json({ message: 'Error deleting question', error: error.message });
    }
};

// ================= UPDATE QUIZ =================
const updateQuiz = async (req, res) => {
    const { quiz_id } = req.params;
    const { title, passing_score, max_attempts, time_limit_sec } = req.body;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can update quizzes' });
        }

        const result = await pool.query(
            `UPDATE quiz SET
                title = COALESCE($1, title),
                passing_score = COALESCE($2, passing_score),
                max_attempts = COALESCE($3, max_attempts),
                time_limit_sec = COALESCE($4, time_limit_sec)
             WHERE quiz_id = $5
             RETURNING *`,
            [title, passing_score, max_attempts, time_limit_sec, quiz_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Quiz not found' });
        }

        res.json({ message: 'Quiz updated successfully', quiz: result.rows[0] });

    } catch (error) {
        res.status(500).json({ message: 'Error updating quiz', error: error.message });
    }
};

// ================= DELETE QUIZ =================
const deleteQuiz = async (req, res) => {
    const { quiz_id } = req.params;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can delete quizzes' });
        }

        const result = await pool.query(
            'DELETE FROM quiz WHERE quiz_id = $1 RETURNING *',
            [quiz_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Quiz not found' });
        }

        res.json({ message: 'Quiz deleted successfully' });

    } catch (error) {
        res.status(500).json({ message: 'Error deleting quiz', error: error.message });
    }
};

// ================= SUBMIT SINGLE ANSWER (Student) =================
const submitAnswer = async (req, res) => {
    const { quiz_id, question_id } = req.params;
    const { answer_id, answer_text } = req.body;

    try {
        if (req.user.role !== 'student') {
            return res.status(403).json({ message: 'Only students can submit answers' });
        }

        const student_id = await getStudentId(req.user.user_id);

        const quizResult = await pool.query(
            'SELECT * FROM quiz WHERE quiz_id = $1',
            [quiz_id]
        );
        if (quizResult.rows.length === 0) {
            return res.status(404).json({ message: 'Quiz not found' });
        }
        if (quizResult.rows[0].is_locked) {
            return res.status(403).json({ message: 'Quiz is locked! Pass the activity first.' });
        }

        const alreadyAnswered = await pool.query(
            `SELECT * FROM student_quiz_answer 
             WHERE student_id = $1 AND question_id = $2 AND quiz_id = $3`,
            [student_id, question_id, quiz_id]
        );
        if (alreadyAnswered.rows.length > 0) {
            return res.status(400).json({ message: 'You already answered this question' });
        }

        const questionResult = await pool.query(
            'SELECT * FROM quiz_question WHERE quiz_question_id = $1 AND quiz_id = $2',
            [question_id, quiz_id]
        );
        if (questionResult.rows.length === 0) {
            return res.status(404).json({ message: 'Question not found' });
        }
        const question = questionResult.rows[0];

        const correctAnswer = await pool.query(
            'SELECT * FROM quiz_answer WHERE question_id = $1 AND is_correct = true',
            [question_id]
        );
        if (correctAnswer.rows.length === 0) {
            return res.status(404).json({ message: 'Correct answer not found' });
        }

        let isCorrect = false;

        if (['identification', 'fill_in_blank'].includes(question.question_type)) {
            isCorrect = correctAnswer.rows[0].answer_text.toLowerCase().trim() ===
                        answer_text?.toLowerCase().trim();
        } else {
            isCorrect = correctAnswer.rows.some(a => a.quiz_answer_id === parseInt(answer_id));
        }

        await pool.query(
            `INSERT INTO student_quiz_answer 
             (student_id, quiz_id, question_id, answer_id, answer_text, is_correct)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [student_id, quiz_id, question_id, answer_id || null, answer_text || null, isCorrect]
        );

        const answeredResult = await pool.query(
            `SELECT COUNT(*) as total FROM student_quiz_answer
             WHERE student_id = $1 AND quiz_id = $2`,
            [student_id, quiz_id]
        );
        const answered_count = parseInt(answeredResult.rows[0].total);

        const totalResult = await pool.query(
            'SELECT COUNT(*) as total FROM quiz_question WHERE quiz_id = $1',
            [quiz_id]
        );
        const total_questions = Math.min(parseInt(totalResult.rows[0].total), 10);

        res.json({
            question_id: parseInt(question_id),
            is_correct: isCorrect,
            correct_answer: isCorrect ? null : correctAnswer.rows[0].answer_text,
            message: isCorrect ? 'Correct! ✅' : 'Wrong! ❌',
            answered_count,
            total_questions,
            all_answered: answered_count >= total_questions
        });

    } catch (error) {
        res.status(500).json({ message: 'Error submitting answer', error: error.message });
    }
};

// ================= FINISH QUIZ (Student) =================
const finishQuiz = async (req, res) => {
    const { quiz_id } = req.params;

    try {
        if (req.user.role !== 'student') {
            return res.status(403).json({ message: 'Only students can finish quizzes' });
        }

        const student_id = await getStudentId(req.user.user_id);

        const quizResult = await pool.query(
            'SELECT * FROM quiz WHERE quiz_id = $1',
            [quiz_id]
        );
        if (quizResult.rows.length === 0) {
            return res.status(404).json({ message: 'Quiz not found' });
        }
        const quiz = quizResult.rows[0];

        const scoreResult = await pool.query(
            `SELECT 
                COUNT(*) as total_answered,
                COUNT(CASE WHEN is_correct = true THEN 1 END) as correct_count
             FROM student_quiz_answer
             WHERE student_id = $1 AND quiz_id = $2`,
            [student_id, quiz_id]
        );

        const score = parseInt(scoreResult.rows[0].correct_count);
        const total_items = parseInt(scoreResult.rows[0].total_answered);
        const passing_score = quiz.passing_score;
        const is_passed = score >= passing_score;
        const percentage = total_items > 0 ? ((score / total_items) * 100).toFixed(2) : '0.00';

        if (is_passed) {
            // Unlock next level
            await pool.query(
                `UPDATE quest_level SET is_locked = false
                 WHERE quest_id = (SELECT quest_id FROM quest_level WHERE quest_level_id = $1)
                 AND level_number = (SELECT level_number + 1 FROM quest_level WHERE quest_level_id = $1)`,
                [quiz.quest_level_id]
            );

            await pool.query(
                `INSERT INTO student_progress 
                 (student_id, quest_id, quest_level_id, activity_passed, quiz_unlocked, level_status)
                 SELECT $1, ql.quest_id, $2, true, true, 'completed'
                 FROM quest_level ql WHERE ql.quest_level_id = $2
                 ON CONFLICT (student_id, quest_level_id) 
                 DO UPDATE SET 
                    level_status = 'completed',
                    quiz_attempts = student_progress.quiz_attempts + 1,
                    quiz_best_score = GREATEST(student_progress.quiz_best_score, $3),
                    updated_at = NOW()`,
                [student_id, quiz.quest_level_id, score]
            );

            await pool.query(
                `INSERT INTO assessment_result
                 (student_id, quest_level_id, quiz_id, source_type, raw_score, total_items, percentage, is_passed, points_earned)
                 VALUES ($1, $2, $3, 'quiz', $4, $5, $6, true, $7)`,
                [student_id, quiz.quest_level_id, quiz_id, score, total_items, percentage, score * 10]
            );
        } else {
            await pool.query(
                `INSERT INTO student_progress 
                 (student_id, quest_id, quest_level_id, activity_passed, quiz_unlocked, level_status)
                 SELECT $1, ql.quest_id, $2, true, true, 'in_progress'
                 FROM quest_level ql WHERE ql.quest_level_id = $2
                 ON CONFLICT (student_id, quest_level_id) 
                 DO UPDATE SET 
                    quiz_attempts = student_progress.quiz_attempts + 1,
                    updated_at = NOW()`,
                [student_id, quiz.quest_level_id]
            );

            await pool.query(
                `DELETE FROM student_quiz_answer 
                 WHERE student_id = $1 AND quiz_id = $2`,
                [student_id, quiz_id]
            );
        }

        res.json({
            message: is_passed ? 'Quiz passed! Next level unlocked 🎉' : 'Quiz failed. Try again!',
            score,
            total_items,
            passing_score,
            percentage,
            is_passed
        });

    } catch (error) {
        res.status(500).json({ message: 'Error finishing quiz', error: error.message });
    }
};

module.exports = {
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
};