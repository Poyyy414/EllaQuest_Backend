const pool = require('../config/database');
const bcrypt = require('bcrypt');

// ================= HELPER: GET INSTRUCTOR ID =================
const getInstructorId = async (user_id) => {
    const result = await pool.query(
        'SELECT instructor_id FROM instructor WHERE user_id = $1',
        [user_id]
    );
    if (result.rows.length === 0) throw new Error('Instructor not found');
    return result.rows[0].instructor_id;
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
             JOIN instructor i ON u.user_id = i.user_id
             WHERE u.user_id = $1`,
            [user_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Instructor not found' });
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
        const staffEmailRegex = /^[^\s@]+@ncf\.edu\.ph$/;
        if (!staffEmailRegex.test(email)) {
            return res.status(400).json({ 
                message: 'Instructors must use a @ncf.edu.ph email address' 
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
            return res.status(404).json({ message: 'Instructor not found' });
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
            return res.status(404).json({ message: 'Instructor not found' });
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

// ================= VIEW ASSIGNED COURSES =================
const getAssignedCourses = async (req, res) => {
    const user_id = req.user.user_id;

    try {
        const result = await pool.query(
            `SELECT i.instructor_id
             FROM instructor i
             WHERE i.user_id = $1`,
            [user_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Instructor not found' });
        }

        res.json({ 
            message: 'Assigned courses will be available once courses table is set up',
            instructor_id: result.rows[0].instructor_id
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching assigned courses', error: error.message });
    }
};

// ================= VIEW STUDENTS IN COURSE =================
const getStudentsInCourse = async (req, res) => {
    const user_id = req.user.user_id;
    const { course_id } = req.params;

    try {
        const instructorResult = await pool.query(
            `SELECT i.instructor_id
             FROM instructor i
             WHERE i.user_id = $1`,
            [user_id]
        );

        if (instructorResult.rows.length === 0) {
            return res.status(404).json({ message: 'Instructor not found' });
        }

        res.json({ 
            message: 'Students in course will be available once courses table is set up',
            instructor_id: instructorResult.rows[0].instructor_id,
            course_id
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching students in course', error: error.message });
    }
};

// ================= GET MY SECTIONS =================
const getMySections = async (req, res) => {
    try {
        const instructor_id = await getInstructorId(req.user.user_id);

        const result = await pool.query(
            `SELECT 
                s.section_id,
                s.section_name,
                s.section_code,
                s.school_year,
                s.semester,
                s.is_active,
                s.created_at,
                c.course_id,
                c.course_name,
                c.description,
                COUNT(ss.ss_id) FILTER (WHERE ss.status = 'approved') AS total_students
             FROM section s
             JOIN course c                ON s.course_id  = c.course_id
             LEFT JOIN student_section ss ON s.section_id = ss.section_id
             WHERE s.instructor_id = $1
             GROUP BY s.section_id, c.course_id
             ORDER BY s.created_at DESC`,
            [instructor_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No sections found' });
        }

        res.json({
            message: 'Sections fetched successfully',
            sections: result.rows
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching sections', error: error.message });
    }
};

// ================= GET MY SPECIFIC SECTION WITH STUDENTS =================
const getMySectionById = async (req, res) => {
    const { section_id } = req.params;

    try {
        const instructor_id = await getInstructorId(req.user.user_id);

        // Get section info
        const sectionResult = await pool.query(
            `SELECT 
                s.section_id,
                s.section_name,
                s.section_code,
                s.school_year,
                s.semester,
                s.is_active,
                s.created_at,
                c.course_id,
                c.course_name,
                c.description
             FROM section s
             JOIN course c ON s.course_id = c.course_id
             WHERE s.section_id    = $1
               AND s.instructor_id = $2`,
            [section_id, instructor_id]
        );

        if (sectionResult.rows.length === 0) {
            return res.status(404).json({ message: 'Section not found or unauthorized' });
        }

        // Get all approved students in that section
        const studentsResult = await pool.query(
            `SELECT 
                ss.ss_id,
                ss.status,
                ss.enrolled_at,
                ss.is_active,
                u.user_id,
                u.first_name,
                u.last_name,
                u.email,
                st.student_id,
                st.total_points
             FROM student_section ss
             JOIN student st ON ss.student_id = st.student_id
             JOIN users u    ON st.user_id    = u.user_id
             WHERE ss.section_id = $1
               AND ss.status     = 'approved'
             ORDER BY u.last_name ASC`,
            [section_id]
        );

        res.json({
            message: 'Section fetched successfully',
            section: sectionResult.rows[0],
            students: studentsResult.rows,
            total_students: studentsResult.rows.length
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching section', error: error.message });
    }
};

module.exports = {
    getProfile,
    updateProfile,
    changePassword,
    getAssignedCourses,
    getStudentsInCourse,
    getMySections,
    getMySectionById
};