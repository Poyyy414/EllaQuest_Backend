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

// ================= CREATE ACTIVITY =================
const createActivity = async (req, res) => {
    const { quest_level_id } = req.params;
    const { title, difficulty, passing_score } = req.body;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can create activities' });
        }

        const existing = await pool.query(
            'SELECT * FROM activity WHERE quest_level_id = $1',
            [quest_level_id]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ message: 'Activity already exists for this level' });
        }

        const result = await pool.query(
            `INSERT INTO activity (quest_level_id, title, difficulty, game_type, passing_score, is_passed)
             VALUES ($1, $2, $3, 'mixed', $4, false)
             RETURNING *`,
            [quest_level_id, title, difficulty, passing_score || 7]
        );

        res.status(201).json({
            message: 'Activity created successfully',
            activity: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({ message: 'Error creating activity', error: error.message });
    }
};

// ================= GET ACTIVITY BY LEVEL =================
const getActivityByLevel = async (req, res) => {
    const { quest_level_id } = req.params;

    try {
        const result = await pool.query(
            `SELECT a.*, COUNT(aq.activity_question_id) as total_questions
             FROM activity a
             LEFT JOIN activity_question aq ON a.activity_id = aq.activity_id
             WHERE a.quest_level_id = $1
             GROUP BY a.activity_id`,
            [quest_level_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No activity found for this level' });
        }

        res.json({ activity: result.rows[0] });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching activity', error: error.message });
    }
};

// ================= GET ALL QUESTIONS (CM only) =================
const getActivityWithQuestions = async (req, res) => {
    const { activity_id } = req.params;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can view all questions' });
        }

        const activityResult = await pool.query(
            'SELECT * FROM activity WHERE activity_id = $1',
            [activity_id]
        );
        if (activityResult.rows.length === 0) {
            return res.status(404).json({ message: 'Activity not found' });
        }

        const questions = await pool.query(
            `SELECT aq.activity_question_id, aq.question_text, aq.question_type,
                    aq.media_url, aq.order_index,
                    json_agg(
                        json_build_object(
                            'activity_answer_id', aa.activity_answer_id,
                            'answer_text', aa.answer_text,
                            'is_correct', aa.is_correct,
                            'order_index', aa.order_index
                        ) ORDER BY aa.order_index
                    ) as answers
             FROM activity_question aq
             LEFT JOIN activity_answer aa ON aq.activity_question_id = aa.question_id
             WHERE aq.activity_id = $1
             GROUP BY aq.activity_question_id
             ORDER BY aq.order_index`,
            [activity_id]
        );

        res.json({
            activity: activityResult.rows[0],
            questions: questions.rows
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching activity questions', error: error.message });
    }
};

// ================= GET NEXT QUESTION (Student) =================
const getNextQuestion = async (req, res) => {
    const { activity_id } = req.params;

    try {
        if (req.user.role !== 'student') {
            return res.status(403).json({ message: 'Only students can take activities' });
        }

        const student_id = await getStudentId(req.user.user_id);

        const activityResult = await pool.query(
            'SELECT * FROM activity WHERE activity_id = $1',
            [activity_id]
        );
        if (activityResult.rows.length === 0) {
            return res.status(404).json({ message: 'Activity not found' });
        }

        // Get total questions
        const totalResult = await pool.query(
            'SELECT COUNT(*) as total FROM activity_question WHERE activity_id = $1',
            [activity_id]
        );
        const total_questions = parseInt(totalResult.rows[0].total);

        // Get already answered question IDs
        const answeredResult = await pool.query(
            `SELECT question_id FROM student_activity_answer
             WHERE student_id = $1 AND activity_id = $2`,
            [student_id, activity_id]
        );
        const answeredIds = answeredResult.rows.map(r => r.question_id);
        const answered_count = answeredIds.length;

        // If all questions answered
        if (answered_count >= total_questions || answered_count >= 10) {
            return res.json({
                message: 'All questions answered! Click finish to see your score.',
                completed: true,
                answered_count,
                total_questions: Math.min(total_questions, 10)
            });
        }

        // Get next unanswered question
        let nextQuestion;

        if (answeredIds.length > 0) {
            nextQuestion = await pool.query(
                `SELECT aq.activity_question_id, aq.question_text, aq.question_type,
                        aq.media_url, aq.order_index,
                        CASE 
                            WHEN aq.question_type IN ('identification', 'fill_in_blank') 
                            THEN '[]'::json
                            ELSE json_agg(
                                json_build_object(
                                    'activity_answer_id', aa.activity_answer_id,
                                    'answer_text', aa.answer_text,
                                    'order_index', aa.order_index
                                ) ORDER BY RANDOM()
                            )
                        END as answers
                 FROM activity_question aq
                 LEFT JOIN activity_answer aa ON aq.activity_question_id = aa.question_id
                 WHERE aq.activity_id = $1
                 AND aq.activity_question_id NOT IN (${answeredIds.join(',')})
                 GROUP BY aq.activity_question_id
                 ORDER BY RANDOM()
                 LIMIT 1`,
                [activity_id]
            );
        } else {
            nextQuestion = await pool.query(
                `SELECT aq.activity_question_id, aq.question_text, aq.question_type,
                        aq.media_url, aq.order_index,
                        CASE 
                            WHEN aq.question_type IN ('identification', 'fill_in_blank') 
                            THEN '[]'::json
                            ELSE json_agg(
                                json_build_object(
                                    'activity_answer_id', aa.activity_answer_id,
                                    'answer_text', aa.answer_text,
                                    'order_index', aa.order_index
                                ) ORDER BY RANDOM()
                            )
                        END as answers
                 FROM activity_question aq
                 LEFT JOIN activity_answer aa ON aq.activity_question_id = aa.question_id
                 WHERE aq.activity_id = $1
                 GROUP BY aq.activity_question_id
                 ORDER BY RANDOM()
                 LIMIT 1`,
                [activity_id]
            );
        }

        if (nextQuestion.rows.length === 0) {
            return res.json({
                message: 'All questions answered! Click finish to see your score.',
                completed: true,
                answered_count,
                total_questions: Math.min(total_questions, 10)
            });
        }

        res.json({
            question: nextQuestion.rows[0],
            answered_count,
            total_questions: Math.min(total_questions, 10),
            completed: false
        });

    } catch (error) {
        res.status(500).json({ message: 'Error getting next question', error: error.message });
    }
};

// ================= ADD QUESTION TO ACTIVITY =================
const addQuestion = async (req, res) => {
    const { activity_id } = req.params;
    const { question_text, question_type, media_url, order_index, answers } = req.body;

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

        const activityCheck = await pool.query(
            'SELECT * FROM activity WHERE activity_id = $1',
            [activity_id]
        );
        if (activityCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Activity not found' });
        }

        const questionResult = await pool.query(
            `INSERT INTO activity_question (activity_id, question_text, question_type, media_url, order_index)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [activity_id, question_text, question_type, media_url, order_index]
        );
        const activity_question_id = questionResult.rows[0].activity_question_id;

        const insertedAnswers = [];
        for (const answer of answers) {
            const answerResult = await pool.query(
                `INSERT INTO activity_answer (question_id, activity_id, answer_text, is_correct, order_index)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`,
                [activity_question_id, activity_id, answer.answer_text, answer.is_correct, answer.order_index]
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
    const { question_text, question_type, media_url, order_index } = req.body;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can update questions' });
        }

        const result = await pool.query(
            `UPDATE activity_question SET
                question_text = COALESCE($1, question_text),
                question_type = COALESCE($2, question_type),
                media_url = COALESCE($3, media_url),
                order_index = COALESCE($4, order_index)
             WHERE activity_question_id = $5
             RETURNING *`,
            [question_text, question_type, media_url, order_index, question_id]
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
            'DELETE FROM activity_question WHERE activity_question_id = $1 RETURNING *',
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

// ================= UPDATE ACTIVITY =================
const updateActivity = async (req, res) => {
    const { activity_id } = req.params;
    const { title, difficulty, passing_score } = req.body;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can update activities' });
        }

        const result = await pool.query(
            `UPDATE activity SET
                title = COALESCE($1, title),
                difficulty = COALESCE($2, difficulty),
                passing_score = COALESCE($3, passing_score)
             WHERE activity_id = $4
             RETURNING *`,
            [title, difficulty, passing_score, activity_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Activity not found' });
        }

        res.json({ message: 'Activity updated successfully', activity: result.rows[0] });

    } catch (error) {
        res.status(500).json({ message: 'Error updating activity', error: error.message });
    }
};

// ================= DELETE ACTIVITY =================
const deleteActivity = async (req, res) => {
    const { activity_id } = req.params;

    try {
        if (req.user.role !== 'curriculum_manager') {
            return res.status(403).json({ message: 'Only curriculum managers can delete activities' });
        }

        const result = await pool.query(
            'DELETE FROM activity WHERE activity_id = $1 RETURNING *',
            [activity_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Activity not found' });
        }

        res.json({ message: 'Activity deleted successfully' });

    } catch (error) {
        res.status(500).json({ message: 'Error deleting activity', error: error.message });
    }
};

// ================= SUBMIT SINGLE ANSWER (Student) =================
const submitAnswer = async (req, res) => {
    const { activity_id, question_id } = req.params;
    const { answer_id, answer_text } = req.body;

    try {
        if (req.user.role !== 'student') {
            return res.status(403).json({ message: 'Only students can submit answers' });
        }

        const student_id = await getStudentId(req.user.user_id);

        // Check if already answered
        const alreadyAnswered = await pool.query(
            `SELECT * FROM student_activity_answer 
             WHERE student_id = $1 AND question_id = $2 AND activity_id = $3`,
            [student_id, question_id, activity_id]
        );
        if (alreadyAnswered.rows.length > 0) {
            return res.status(400).json({ message: 'You already answered this question' });
        }

        // Get question
        const questionResult = await pool.query(
            'SELECT * FROM activity_question WHERE activity_question_id = $1 AND activity_id = $2',
            [question_id, activity_id]
        );
        if (questionResult.rows.length === 0) {
            return res.status(404).json({ message: 'Question not found' });
        }
        const question = questionResult.rows[0];

        // Get correct answer
        const correctAnswer = await pool.query(
            'SELECT * FROM activity_answer WHERE question_id = $1 AND is_correct = true',
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
            isCorrect = correctAnswer.rows.some(a => a.activity_answer_id === parseInt(answer_id));
        }

        // Save to DB
        await pool.query(
            `INSERT INTO student_activity_answer 
             (student_id, activity_id, question_id, answer_id, answer_text, is_correct)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [student_id, activity_id, question_id, answer_id || null, answer_text || null, isCorrect]
        );

        // Count answered so far
        const answeredResult = await pool.query(
            `SELECT COUNT(*) as total FROM student_activity_answer
             WHERE student_id = $1 AND activity_id = $2`,
            [student_id, activity_id]
        );
        const answered_count = parseInt(answeredResult.rows[0].total);

        const totalResult = await pool.query(
            'SELECT COUNT(*) as total FROM activity_question WHERE activity_id = $1',
            [activity_id]
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

// ================= FINISH ACTIVITY (Student) =================
const finishActivity = async (req, res) => {
    const { activity_id } = req.params;

    try {
        if (req.user.role !== 'student') {
            return res.status(403).json({ message: 'Only students can finish activities' });
        }

        const student_id = await getStudentId(req.user.user_id);

        const activityResult = await pool.query(
            'SELECT * FROM activity WHERE activity_id = $1',
            [activity_id]
        );
        if (activityResult.rows.length === 0) {
            return res.status(404).json({ message: 'Activity not found' });
        }
        const activity = activityResult.rows[0];

        const scoreResult = await pool.query(
            `SELECT 
                COUNT(*) as total_answered,
                COUNT(CASE WHEN is_correct = true THEN 1 END) as correct_count
             FROM student_activity_answer
             WHERE student_id = $1 AND activity_id = $2`,
            [student_id, activity_id]
        );

        const score = parseInt(scoreResult.rows[0].correct_count);
        const total_items = parseInt(scoreResult.rows[0].total_answered);
        const passing_score = activity.passing_score;
        const is_passed = score >= passing_score;
        const percentage = total_items > 0 ? ((score / total_items) * 100).toFixed(2) : '0.00';

        if (is_passed) {
            await pool.query(
                `UPDATE quiz SET is_locked = false WHERE quest_level_id = $1`,
                [activity.quest_level_id]
            );

            await pool.query(
                `INSERT INTO student_progress 
                 (student_id, quest_id, quest_level_id, activity_passed, quiz_unlocked, level_status)
                 SELECT $1, ql.quest_id, $2, true, true, 'in_progress'
                 FROM quest_level ql WHERE ql.quest_level_id = $2
                 ON CONFLICT (student_id, quest_level_id) 
                 DO UPDATE SET 
                    activity_passed = true,
                    quiz_unlocked = true,
                    level_status = 'in_progress',
                    updated_at = NOW()`,
                [student_id, activity.quest_level_id]
            );
        } else {
            await pool.query(
                `DELETE FROM student_activity_answer 
                 WHERE student_id = $1 AND activity_id = $2`,
                [student_id, activity_id]
            );
        }

        res.json({
            message: is_passed ? 'Activity passed! Quiz is now unlocked 🎉' : 'Activity failed. Try again!',
            score,
            total_items,
            passing_score,
            percentage,
            is_passed
        });

    } catch (error) {
        res.status(500).json({ message: 'Error finishing activity', error: error.message });
    }
};

module.exports = {
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
};