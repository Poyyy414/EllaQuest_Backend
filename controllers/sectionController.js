const pool = require('../config/database');
const crypto = require('crypto');

// ================= HELPER: GET INSTRUCTOR ID =================
const getInstructorId = async (user_id) => {
    const result = await pool.query(
        'SELECT instructor_id FROM instructor WHERE user_id = $1',
        [user_id]
    );
    if (result.rows.length === 0) throw new Error('Instructor not found');
    return result.rows[0].instructor_id;
};

// ================= HELPER: GENERATE SECTION CODE =================
const generateSectionCode = () => {
    return crypto.randomBytes(3).toString('hex').toUpperCase(); // e.g. "A3F9B2"
};

// ================= CREATE SECTION =================
const createSection = async (req, res) => {
    const { course_id } = req.params;
    const { section_name, school_year, semester } = req.body;

    try {
        if (req.user.role !== 'instructor') {
            return res.status(403).json({ message: 'Only instructors can create sections' });
        }

        if (!section_name) {
            return res.status(400).json({ message: 'Section name is required' });
        }

        const instructor_id = await getInstructorId(req.user.user_id);

        // Check if course belongs to this instructor
        const courseCheck = await pool.query(
            'SELECT * FROM course WHERE course_id = $1 AND instructor_id = $2',
            [course_id, instructor_id]
        );
        if (courseCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Course not found or unauthorized' });
        }

        // Generate unique section code
        let section_code;
        let isUnique = false;
        while (!isUnique) {
            section_code = generateSectionCode();
            const existing = await pool.query(
                'SELECT * FROM section WHERE section_code = $1',
                [section_code]
            );
            if (existing.rows.length === 0) isUnique = true;
        }

        const result = await pool.query(
            `INSERT INTO section 
            (course_id, instructor_id, section_name, section_code, school_year, semester, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, true)
            RETURNING *`,
            [course_id, instructor_id, section_name, section_code, school_year, semester]
        );

        res.status(201).json({
            message: 'Section created successfully',
            section: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({ message: 'Error creating section', error: error.message });
    }
};

// ================= GET ALL SECTIONS BY COURSE =================
const getSectionsByCourse = async (req, res) => {
    const { course_id } = req.params;

    try {
        if (req.user.role !== 'instructor') {
            return res.status(403).json({ message: 'Only instructors can view sections' });
        }

        const instructor_id = await getInstructorId(req.user.user_id);

        // Check course ownership
        const courseCheck = await pool.query(
            'SELECT * FROM course WHERE course_id = $1 AND instructor_id = $2',
            [course_id, instructor_id]
        );
        if (courseCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Course not found or unauthorized' });
        }

        const result = await pool.query(
            `SELECT s.*, 
                    COUNT(ss.ss_id) as total_students,
                    COUNT(CASE WHEN ss.status = 'pending' THEN 1 END) as pending_students,
                    COUNT(CASE WHEN ss.status = 'approved' THEN 1 END) as approved_students
             FROM section s
             LEFT JOIN student_section ss ON s.section_id = ss.section_id
             WHERE s.course_id = $1
             GROUP BY s.section_id
             ORDER BY s.created_at DESC`,
            [course_id]
        );

        res.json({ sections: result.rows });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching sections', error: error.message });
    }
};

// ================= GET SECTION BY ID =================
const getSectionById = async (req, res) => {
    const { section_id } = req.params;

    try {
        if (req.user.role !== 'instructor') {
            return res.status(403).json({ message: 'Only instructors can view section details' });
        }

        const instructor_id = await getInstructorId(req.user.user_id);

        const result = await pool.query(
            `SELECT s.* FROM section s
             WHERE s.section_id = $1 AND s.instructor_id = $2`,
            [section_id, instructor_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Section not found or unauthorized' });
        }

        // Get students in this section
        const students = await pool.query(
            `SELECT ss.ss_id, ss.status, ss.enrolled_at, ss.is_active,
                    u.first_name, u.last_name, u.email,
                    st.student_id, st.total_points
             FROM student_section ss
             JOIN student st ON ss.student_id = st.student_id
             JOIN users u ON st.user_id = u.user_id
             WHERE ss.section_id = $1
             ORDER BY ss.enrolled_at DESC`,
            [section_id]
        );

        res.json({
            section: result.rows[0],
            students: students.rows
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching section', error: error.message });
    }
};

// ================= UPDATE SECTION =================
const updateSection = async (req, res) => {
    const { section_id } = req.params;
    const { section_name, school_year, semester, is_active } = req.body;

    try {
        if (req.user.role !== 'instructor') {
            return res.status(403).json({ message: 'Only instructors can update sections' });
        }

        const instructor_id = await getInstructorId(req.user.user_id);

        const sectionCheck = await pool.query(
            'SELECT * FROM section WHERE section_id = $1 AND instructor_id = $2',
            [section_id, instructor_id]
        );
        if (sectionCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Section not found or unauthorized' });
        }

        const result = await pool.query(
            `UPDATE section SET
                section_name = COALESCE($1, section_name),
                school_year  = COALESCE($2, school_year),
                semester     = COALESCE($3, semester),
                is_active    = COALESCE($4, is_active)
             WHERE section_id = $5
             RETURNING *`,
            [section_name, school_year, semester, is_active, section_id]
        );

        res.json({
            message: 'Section updated successfully',
            section: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({ message: 'Error updating section', error: error.message });
    }
};

// ================= DELETE SECTION =================
const deleteSection = async (req, res) => {
    const { section_id } = req.params;

    try {
        if (req.user.role !== 'instructor') {
            return res.status(403).json({ message: 'Only instructors can delete sections' });
        }

        const instructor_id = await getInstructorId(req.user.user_id);

        const sectionCheck = await pool.query(
            'SELECT * FROM section WHERE section_id = $1 AND instructor_id = $2',
            [section_id, instructor_id]
        );
        if (sectionCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Section not found or unauthorized' });
        }

        await pool.query('DELETE FROM section WHERE section_id = $1', [section_id]);

        res.json({ message: 'Section deleted successfully' });

    } catch (error) {
        res.status(500).json({ message: 'Error deleting section', error: error.message });
    }
};

// ================= APPROVE / REJECT STUDENT =================
const updateStudentStatus = async (req, res) => {
    const { section_id, ss_id } = req.params;
    const { status } = req.body; // 'approved' or 'rejected'

    try {
        if (req.user.role !== 'instructor') {
            return res.status(403).json({ message: 'Only instructors can manage students' });
        }

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Status must be approved or rejected' });
        }

        const instructor_id = await getInstructorId(req.user.user_id);

        // Check section ownership
        const sectionCheck = await pool.query(
            'SELECT * FROM section WHERE section_id = $1 AND instructor_id = $2',
            [section_id, instructor_id]
        );
        if (sectionCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Section not found or unauthorized' });
        }

        const result = await pool.query(
            `UPDATE student_section SET status = $1
             WHERE ss_id = $2 AND section_id = $3
             RETURNING *`,
            [status, ss_id, section_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Student enrollment not found' });
        }

        res.json({
            message: `Student ${status} successfully`,
            enrollment: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({ message: 'Error updating student status', error: error.message });
    }
};

// ================= GET PENDING STUDENTS =================
const getPendingStudents = async (req, res) => {
    const { section_id } = req.params;

    try {
        if (req.user.role !== 'instructor') {
            return res.status(403).json({ message: 'Only instructors can view pending students' });
        }

        const instructor_id = await getInstructorId(req.user.user_id);

        const sectionCheck = await pool.query(
            'SELECT * FROM section WHERE section_id = $1 AND instructor_id = $2',
            [section_id, instructor_id]
        );
        if (sectionCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Section not found or unauthorized' });
        }

        const result = await pool.query(
            `SELECT ss.ss_id, ss.enrolled_at,
                    u.first_name, u.last_name, u.email,
                    st.student_id
             FROM student_section ss
             JOIN student st ON ss.student_id = st.student_id
             JOIN users u ON st.user_id = u.user_id
             WHERE ss.section_id = $1 AND ss.status = 'pending'
             ORDER BY ss.enrolled_at ASC`,
            [section_id]
        );

        res.json({ pending_students: result.rows });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching pending students', error: error.message });
    }
};

// ================= JOIN SECTION (Student) =================
const joinSection = async (req, res) => {
    const { section_code } = req.body;

    try {
        if (req.user.role !== 'student') {
            return res.status(403).json({ message: 'Only students can join sections' });
        }

        // Get student_id
        const studentResult = await pool.query(
            'SELECT student_id FROM student WHERE user_id = $1',
            [req.user.user_id]
        );
        if (studentResult.rows.length === 0) {
            return res.status(404).json({ message: 'Student not found' });
        }
        const student_id = studentResult.rows[0].student_id;

        // Find section by code
        const sectionResult = await pool.query(
            'SELECT * FROM section WHERE section_code = $1 AND is_active = true',
            [section_code]
        );
        if (sectionResult.rows.length === 0) {
            return res.status(404).json({ message: 'Invalid or inactive section code' });
        }
        const section = sectionResult.rows[0];

        // Check if already enrolled
        const existing = await pool.query(
            'SELECT * FROM student_section WHERE student_id = $1 AND section_id = $2',
            [student_id, section.section_id]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ 
                message: `You already enrolled in this section with status: ${existing.rows[0].status}` 
            });
        }

        // Insert with pending status
        const result = await pool.query(
            `INSERT INTO student_section (student_id, section_id, status)
             VALUES ($1, $2, 'pending')
             RETURNING *`,
            [student_id, section.section_id]
        );

        res.status(201).json({
            message: 'Enrollment request sent! Please wait for instructor approval.',
            enrollment: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({ message: 'Error joining section', error: error.message });
    }
};

module.exports = {
    createSection,
    getSectionsByCourse,
    getSectionById,
    updateSection,
    deleteSection,
    updateStudentStatus,
    getPendingStudents,
    joinSection
};