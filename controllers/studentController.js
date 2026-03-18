const pool = require('../config/database');
const bcrypt = require('bcrypt');

// ================= HELPER: GET STUDENT ID =================
const getStudentId = async (user_id) => {
    const result = await pool.query(
        'SELECT student_id FROM student WHERE user_id = $1',
        [user_id]
    );
    if (result.rows.length === 0) throw new Error('Student not found');
    return result.rows[0].student_id;
};

// ================= GET OWN PROFILE =================
const getProfile = async (req, res) => {
    const user_id = req.user.user_id;

    try {
        const result = await pool.query(
            `SELECT 
                u.user_id, 
                u.first_name,
                u.last_name,
                u.email, 
                r.role_name, 
                u.created_at
             FROM users u
             JOIN roles r ON u.role_id = r.role_id
             JOIN student s ON u.user_id = s.user_id
             WHERE u.user_id = $1`,
            [user_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Student not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching profile', error: error.message });
    }
};

// ================= UPDATE OWN PROFILE =================
const updateProfile = async (req, res) => {
    const user_id = req.user.user_id;
    const { first_name, last_name, email } = req.body;

    try {
        const studentEmailRegex = /^[^\s@]+@gbox\.ncf\.edu\.ph$/;
        if (!studentEmailRegex.test(email)) {
            return res.status(400).json({ 
                message: 'Students must use a @gbox.ncf.edu.ph email address' 
            });
        }

        const result = await pool.query(
            `UPDATE users 
             SET first_name = $1, 
                 last_name = $2,
                 email = $3, 
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $4 
             RETURNING user_id, first_name, last_name, email, updated_at`,
            [first_name, last_name, email, user_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Student not found' });
        }

        res.json({ 
            message: 'Profile updated successfully', 
            user: result.rows[0] 
        });
    } catch (error) {
        res.status(500).json({ message: 'Error updating profile', error: error.message });
    }
};

// ================= CHANGE PASSWORD =================
const changePassword = async (req, res) => {
    const user_id = req.user.user_id;
    const { current_password, new_password } = req.body;

    try {
        const userResult = await pool.query(
            'SELECT password FROM users WHERE user_id = $1',
            [user_id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const isMatch = await bcrypt.compare(
            current_password, 
            userResult.rows[0].password
        );

        if (!isMatch) {
            return res.status(400).json({ 
                message: 'Current password is incorrect' 
            });
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);

        await pool.query(
            `UPDATE users 
             SET password = $1, 
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $2`,
            [hashedPassword, user_id]
        );

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error changing password', error: error.message });
    }
};

// ================= VIEW ENROLLED COURSES =================
const getEnrolledCourses = async (req, res) => {
    const user_id = req.user.user_id;

    try {
        const result = await pool.query(
            `SELECT s.student_id
             FROM student s
             WHERE s.user_id = $1`,
            [user_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Student not found' });
        }

        res.json({ 
            message: 'Enrolled courses will be available once courses table is set up',
            student_id: result.rows[0].student_id
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching enrolled courses', error: error.message });
    }
};

// ================= GET MY SECTIONS =================
const getMySection = async (req, res) => {
    try {
        const student_id = await getStudentId(req.user.user_id);

        const result = await pool.query(
            `SELECT 
                ss.ss_id,
                ss.status,
                ss.enrolled_at,
                ss.is_active,
                s.section_id,
                s.section_name,
                s.section_code,
                s.school_year,
                s.semester,
                c.course_id,
                c.course_name,
                c.description,
                u.first_name AS instructor_first_name,
                u.last_name  AS instructor_last_name
             FROM student_section ss
             JOIN section s       ON ss.section_id   = s.section_id
             JOIN course c        ON s.course_id     = c.course_id
             JOIN instructor i    ON s.instructor_id = i.instructor_id
             JOIN users u         ON i.user_id       = u.user_id
             WHERE ss.student_id = $1
               AND ss.status     = 'approved'
               AND ss.is_active  = true
             ORDER BY ss.enrolled_at DESC`,
            [student_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'You are not enrolled in any section' });
        }

        res.json({
            message: 'Enrolled sections fetched successfully',
            sections: result.rows
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching sections', error: error.message });
    }
};

// ================= GET MY SPECIFIC SECTION WITH CLASSMATES =================
const getMySectionById = async (req, res) => {
    const { section_id } = req.params;

    try {
        const student_id = await getStudentId(req.user.user_id);

        const result = await pool.query(
            `SELECT 
                ss.ss_id,
                ss.status,
                ss.enrolled_at,
                ss.is_active,
                s.section_id,
                s.section_name,
                s.section_code,
                s.school_year,
                s.semester,
                c.course_id,
                c.course_name,
                c.description,
                u.first_name AS instructor_first_name,
                u.last_name  AS instructor_last_name
             FROM student_section ss
             JOIN section s       ON ss.section_id   = s.section_id
             JOIN course c        ON s.course_id     = c.course_id
             JOIN instructor i    ON s.instructor_id = i.instructor_id
             JOIN users u         ON i.user_id       = u.user_id
             WHERE ss.student_id = $1
               AND ss.section_id = $2
               AND ss.status     = 'approved'`,
            [student_id, section_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Section not found or you are not enrolled' });
        }

        // Get classmates (excluding the student themselves)
        const classmates = await pool.query(
            `SELECT 
                u.first_name,
                u.last_name,
                st.total_points
             FROM student_section ss
             JOIN student st ON ss.student_id = st.student_id
             JOIN users u    ON st.user_id    = u.user_id
             WHERE ss.section_id = $1
               AND ss.status     = 'approved'
               AND ss.student_id != $2
             ORDER BY u.last_name ASC`,
            [section_id, student_id]
        );

        res.json({
            message: 'Section fetched successfully',
            section: result.rows[0],
            classmates: classmates.rows,
            total_classmates: classmates.rows.length
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching section', error: error.message });
    }
};

// ================= GET ALL PUBLISHED QUESTS =================
const getAllPublishedQuests = async (req, res) => {
    const { quest_type } = req.query;

    try {
        const student_id = await getStudentId(req.user.user_id);

        let query = `
            SELECT 
                q.quest_id,
                q.quest_type,
                q.quest_number,
                q.quest_level,
                q.is_unlocked_by_default,
                q.passing_score,
                COUNT(DISTINCT ql.quest_level_id) AS total_levels,
                COUNT(DISTINCT sp.quest_level_id) FILTER (
                    WHERE sp.level_status = 'completed' AND sp.student_id = $1
                ) AS completed_levels
            FROM quest q
            LEFT JOIN quest_level ql ON q.quest_id = ql.quest_id
            LEFT JOIN student_progress sp ON ql.quest_level_id = sp.quest_level_id
                AND sp.student_id = $1
            WHERE q.is_published = true
        `;

        const params = [student_id];

        if (quest_type) {
            query += ` AND q.quest_type = $2`;
            params.push(quest_type);
        }

        query += ` GROUP BY q.quest_id ORDER BY q.quest_type, q.quest_number`;

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No published quests found' });
        }

        res.json({
            message: 'Quests fetched successfully',
            quests: result.rows
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching quests', error: error.message });
    }
};

// ================= GET SPECIFIC QUEST WITH LEVELS =================
const getQuestById = async (req, res) => {
    const { quest_id } = req.params;

    try {
        const student_id = await getStudentId(req.user.user_id);

        // Get quest info
        const questResult = await pool.query(
            `SELECT * FROM quest 
             WHERE quest_id = $1 AND is_published = true`,
            [quest_id]
        );

        if (questResult.rows.length === 0) {
            return res.status(404).json({ message: 'Quest not found or not published' });
        }

        // Get levels with student progress and activity/quiz info
        const levelsResult = await pool.query(
            `SELECT 
                ql.quest_level_id,
                ql.level_number,
                ql.is_locked,
                ql.unlocked_at,
                sp.level_status,
                sp.activity_passed,
                sp.quiz_unlocked,
                sp.quiz_attempts,
                sp.quiz_best_score,
                CASE WHEN a.activity_id IS NOT NULL THEN true ELSE false END AS has_activity,
                CASE WHEN qz.quiz_id IS NOT NULL THEN true ELSE false END AS has_quiz,
                a.activity_id,
                a.title AS activity_title,
                a.difficulty,
                a.passing_score AS activity_passing_score,
                qz.quiz_id,
                qz.title AS quiz_title,
                qz.passing_score AS quiz_passing_score
             FROM quest_level ql
             LEFT JOIN student_progress sp ON ql.quest_level_id = sp.quest_level_id
                AND sp.student_id = $1
             LEFT JOIN activity a ON ql.quest_level_id = a.quest_level_id
             LEFT JOIN quiz qz ON ql.quest_level_id = qz.quest_level_id
             WHERE ql.quest_id = $2
             ORDER BY ql.level_number`,
            [student_id, quest_id]
        );

        res.json({
            message: 'Quest fetched successfully',
            quest: questResult.rows[0],
            levels: levelsResult.rows,
            total_levels: levelsResult.rows.length
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching quest', error: error.message });
    }
};

module.exports = {
    getProfile,
    updateProfile,
    changePassword,
    getEnrolledCourses,
    getMySection,
    getMySectionById,
    getAllPublishedQuests,
    getQuestById
};