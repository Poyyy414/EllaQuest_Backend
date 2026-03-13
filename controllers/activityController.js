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

        // Check if activity already exists for this level
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
            `SELECT a.*, COUNT(aq.question_id) as total_questions
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

// ================= GET ACTIVITY WITH QUESTIONS =================
const getActivityWithQuestions = async (req, res) => {
    const { activity_id } = req.params;

    try {
        const activityResult = await pool.query(
            'SELECT * FROM activity WHERE activity_id = $1',
            [activity_id]
        );

        if (activityResult.rows.length === 0) {
            return res.status(404).json({ message: 'Activity not found' });
        }

        // Get 10 randomized questions with answers
        const questions = await pool.query(
            `SELECT aq.question_id, aq.question_text, aq.question_type, 
                    aq.media_url, aq.order_index,
                    json_agg(
                        json_build_object(
                            'answer_id', aa.answer_id,
                            'answer_text', aa.answer_text,
                            'order_index', aa.order_index
                        ) ORDER BY RANDOM()
                    ) as answers
             FROM activity_question aq
             LEFT JOIN activity_answer aa ON aq.question_id = aa.question_id
             WHERE aq.activity_id = $1
             GROUP BY aq.question_id
             ORDER BY RANDOM()
             LIMIT 10`,
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

        // Validate question_type
        const validTypes = ['multiple_choice', 'true_false', 'identification', 'fill_in_blank'];
        if (!validTypes.includes(question_type)) {
            return res.status(400).json({ 
                message: 'question_type must be multiple_choice, true_false, identification, or fill_in_blank' 
            });
        }

        if (!answers || answers.length < 2) {
            return res.status(400).json({ message: 'At least 2 answers are required' });
        }

        const hasCorrectAnswer = answers.some(a => a.is_correct === true);
        if (!hasCorrectAnswer) {
            return res.status(400).json({ message: 'At least one answer must be correct' });
        }

        // Check activity exists
        const activityCheck = await pool.query(
            'SELECT * FROM activity WHERE activity_id = $1',
            [activity_id]
        );
        if (activityCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Activity not found' });
        }

        // Insert question
        const questionResult = await pool.query(
            `INSERT INTO activity_question (activity_id, question_text, question_type, media_url, order_index)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [activity_id, question_text, question_type, media_url, order_index]
        );
        const question_id = questionResult.rows[0].question_id;

        // Insert answers
        const insertedAnswers = [];
        for (const answer of answers) {
            const answerResult = await pool.query(
                `INSERT INTO activity_answer (question_id, activity_id, answer_text, is_correct, order_index)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`,
                [question_id, activity_id, answer.answer_text, answer.is_correct, answer.order_index]
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
             WHERE question_id = $5
             RETURNING *`,
            [question_text, question_type, media_url, order_index, question_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Question not found' });
        }

        res.json({
            message: 'Question updated successfully',
            question: result.rows[0]
        });

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
            'DELETE FROM activity_question WHERE question_id = $1 RETURNING *',
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

        res.json({
            message: 'Activity updated successfully',
            activity: result.rows[0]
        });

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

// ================= SUBMIT ACTIVITY (Student) =================
const submitActivity = async (req, res) => {
    const { activity_id } = req.params;
    const { answers } = req.body;
    // answers = [{ question_id: 1, answer_id: 2 }, ...]

    try {
        if (req.user.role !== 'student') {
            return res.status(403).json({ message: 'Only students can submit activities' });
        }

        const student_id = await getStudentId(req.user.user_id);

        // Get activity
        const activityResult = await pool.query(
            'SELECT * FROM activity WHERE activity_id = $1',
            [activity_id]
        );
        if (activityResult.rows.length === 0) {
            return res.status(404).json({ message: 'Activity not found' });
        }
        const activity = activityResult.rows[0];

        // Score the answers
        let score = 0;
        const results = [];

        for (const submitted of answers) {
            const correctAnswer = await pool.query(
                `SELECT * FROM activity_answer 
                 WHERE question_id = $1 AND is_correct = true`,
                [submitted.question_id]
            );

            const isCorrect = correctAnswer.rows.some(
                a => a.answer_id === submitted.answer_id
            );

            if (isCorrect) score++;

            results.push({
                question_id: submitted.question_id,
                answer_id: submitted.answer_id,
                is_correct: isCorrect
            });
        }

        const total_items = answers.length;
        const passing_score = activity.passing_score;
        const is_passed = score >= passing_score;
        const percentage = ((score / total_items) * 100).toFixed(2);

        // If passed — unlock quiz for this level
        if (is_passed) {
            await pool.query(
                `UPDATE quiz SET is_locked = false
                 WHERE quest_level_id = $1`,
                [activity.quest_level_id]
            );

            // Update student progress
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
        }

        res.json({
            message: is_passed ? 'Activity passed! Quiz is now unlocked 🎉' : 'Activity failed. Try again!',
            score,
            total_items,
            passing_score,
            percentage,
            is_passed,
            results
        });

    } catch (error) {
        res.status(500).json({ message: 'Error submitting activity', error: error.message });
    }
};

module.exports = {
    createActivity,
    getActivityByLevel,
    getActivityWithQuestions,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    updateActivity,
    deleteActivity,
    submitActivity
};