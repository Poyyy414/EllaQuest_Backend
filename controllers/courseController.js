const pool = require('../config/database');

// ================= CREATE COURSE =================
const createCourse = async (req, res) => {
    const { course_name, description, school_year, semester } = req.body;

    try {
        // Only instructor can create course
        if (req.user.role !== 'instructor') {
            return res.status(403).json({ message: 'Only instructors can create courses' });
        }

        // Get instructor_id from users table
        const instructorResult = await pool.query(
            'SELECT instructor_id FROM instructor WHERE user_id = $1',
            [req.user.user_id]
        );
        if (instructorResult.rows.length === 0) {
            return res.status(404).json({ message: 'Instructor not found' });
        }
        const instructor_id = instructorResult.rows[0].instructor_id;

        const result = await pool.query(
            `INSERT INTO course 
            (instructor_id, course_name, description, school_year, semester, is_active) 
            VALUES ($1, $2, $3, $4, $5, true) 
            RETURNING *`,
            [instructor_id, course_name, description, school_year, semester]
        );

        res.status(201).json({ 
            message: 'Course created successfully', 
            course: result.rows[0] 
        });

    } catch (error) {
        res.status(500).json({ message: 'Error creating course', error: error.message });
    }
};

// ================= GET ALL COURSES =================
const getAllCourses = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT c.*, u.first_name, u.last_name
             FROM course c
             JOIN instructor i ON c.instructor_id = i.instructor_id
             JOIN users u ON i.user_id = u.user_id
             ORDER BY c.created_at DESC`
        );

        res.json({ courses: result.rows });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching courses', error: error.message });
    }
};

// ================= GET COURSE BY ID =================
const getCourseById = async (req, res) => {
    const { course_id } = req.params;

    try {
        const result = await pool.query(
            `SELECT c.*, u.first_name, u.last_name
             FROM course c
             JOIN instructor i ON c.instructor_id = i.instructor_id
             JOIN users u ON i.user_id = u.user_id
             WHERE c.course_id = $1`,
            [course_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Course not found' });
        }

        // Get sections under this course
        const sections = await pool.query(
            'SELECT * FROM section WHERE course_id = $1 ORDER BY created_at DESC',
            [course_id]
        );

        res.json({ 
            course: result.rows[0],
            sections: sections.rows
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching course', error: error.message });
    }
};

// ================= GET MY COURSES (Instructor) =================
const getMyCourses = async (req, res) => {
    try {
        if (req.user.role !== 'instructor') {
            return res.status(403).json({ message: 'Only instructors can view their courses' });
        }

        const instructorResult = await pool.query(
            'SELECT instructor_id FROM instructor WHERE user_id = $1',
            [req.user.user_id]
        );
        if (instructorResult.rows.length === 0) {
            return res.status(404).json({ message: 'Instructor not found' });
        }
        const instructor_id = instructorResult.rows[0].instructor_id;

        const result = await pool.query(
            `SELECT c.*, 
                    COUNT(s.section_id) as total_sections
             FROM course c
             LEFT JOIN section s ON c.course_id = s.course_id
             WHERE c.instructor_id = $1
             GROUP BY c.course_id
             ORDER BY c.created_at DESC`,
            [instructor_id]
        );

        res.json({ courses: result.rows });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching courses', error: error.message });
    }
};

// ================= UPDATE COURSE =================
const updateCourse = async (req, res) => {
    const { course_id } = req.params;
    const { course_name, description, school_year, semester, is_active } = req.body;

    try {
        if (req.user.role !== 'instructor') {
            return res.status(403).json({ message: 'Only instructors can update courses' });
        }

        // Check if course exists and belongs to this instructor
        const instructorResult = await pool.query(
            'SELECT instructor_id FROM instructor WHERE user_id = $1',
            [req.user.user_id]
        );
        const instructor_id = instructorResult.rows[0].instructor_id;

        const courseCheck = await pool.query(
            'SELECT * FROM course WHERE course_id = $1 AND instructor_id = $2',
            [course_id, instructor_id]
        );
        if (courseCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Course not found or unauthorized' });
        }

        const result = await pool.query(
            `UPDATE course SET
                course_name = COALESCE($1, course_name),
                description = COALESCE($2, description),
                school_year = COALESCE($3, school_year),
                semester = COALESCE($4, semester),
                is_active = COALESCE($5, is_active)
             WHERE course_id = $6
             RETURNING *`,
            [course_name, description, school_year, semester, is_active, course_id]
        );

        res.json({ 
            message: 'Course updated successfully', 
            course: result.rows[0] 
        });

    } catch (error) {
        res.status(500).json({ message: 'Error updating course', error: error.message });
    }
};

// ================= DELETE COURSE =================
const deleteCourse = async (req, res) => {
    const { course_id } = req.params;

    try {
        if (req.user.role !== 'instructor') {
            return res.status(403).json({ message: 'Only instructors can delete courses' });
        }

        const instructorResult = await pool.query(
            'SELECT instructor_id FROM instructor WHERE user_id = $1',
            [req.user.user_id]
        );
        const instructor_id = instructorResult.rows[0].instructor_id;

        const courseCheck = await pool.query(
            'SELECT * FROM course WHERE course_id = $1 AND instructor_id = $2',
            [course_id, instructor_id]
        );
        if (courseCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Course not found or unauthorized' });
        }

        await pool.query('DELETE FROM course WHERE course_id = $1', [course_id]);

        res.json({ message: 'Course deleted successfully' });

    } catch (error) {
        res.status(500).json({ message: 'Error deleting course', error: error.message });
    }
};

// ================= EXPORT =================
module.exports = {
    createCourse,
    getAllCourses,
    getCourseById,
    getMyCourses,
    updateCourse,
    deleteCourse
};