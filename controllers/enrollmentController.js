const pool = require("../config/database");

// ─────────────────────────────────────────────
// INSTRUCTOR — Get All Enrolled Students in a Course
// GET /api/enrollments/course/:course_id/students
// ─────────────────────────────────────────────
const getEnrolledStudents = async (req, res) => {
  const { course_id } = req.params;
  const instructor_id = req.user.user_id;

  try {
    // Verify course ownership
    const course = await pool.query(
      "SELECT course_id FROM courses WHERE course_id = $1 AND instructor_id = $2",
      [course_id, instructor_id]
    );

    if (course.rowCount === 0) {
      return res.status(403).json({ message: "Course not found or unauthorized." });
    }

    const result = await pool.query(
      `SELECT 
         e.enrollment_id,
         e.status,
         e.joined_at,
         u.user_id,
         u.first_name,
         u.last_name,
         u.email
       FROM enrollments e
       JOIN users u ON u.user_id = e.student_id
       WHERE e.course_id = $1 AND e.status = 'enrolled'
       ORDER BY e.joined_at ASC`,
      [course_id]
    );

    return res.status(200).json({
      course_id,
      total: result.rowCount,
      students: result.rows,
    });
  } catch (err) {
    console.error("getEnrolledStudents error:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// STUDENT — Get All Courses I Am Enrolled In
// GET /api/enrollments/my-courses
// ─────────────────────────────────────────────
const getMyCourses = async (req, res) => {
  const student_id = req.user.user_id;

  try {
    const result = await pool.query(
      `SELECT 
         e.enrollment_id,
         e.status,
         e.joined_at,
         c.course_id,
         c.title,
         c.description,
         u.first_name AS instructor_first_name,
         u.last_name  AS instructor_last_name
       FROM enrollments e
       JOIN courses c ON c.course_id = e.course_id
       JOIN users u ON u.user_id = c.instructor_id
       WHERE e.student_id = $1
       ORDER BY e.joined_at DESC`,
      [student_id]
    );

    return res.status(200).json({
      total: result.rowCount,
      courses: result.rows,
    });
  } catch (err) {
    console.error("getMyCourses error:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// STUDENT or INSTRUCTOR — Get Enrollment Status
// GET /api/enrollments/course/:course_id/status
// ─────────────────────────────────────────────
const getEnrollmentStatus = async (req, res) => {
  const { course_id } = req.params;
  const student_id = req.user.user_id;

  try {
    const result = await pool.query(
      `SELECT 
         e.enrollment_id,
         e.status,
         e.joined_at,
         c.title,
         c.description
       FROM enrollments e
       JOIN courses c ON c.course_id = e.course_id
       WHERE e.course_id = $1 AND e.student_id = $2`,
      [course_id, student_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "No enrollment found for this course." });
    }

    return res.status(200).json({ enrollment: result.rows[0] });
  } catch (err) {
    console.error("getEnrollmentStatus error:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// INSTRUCTOR — Approve Student (verify legit student)
// PATCH /api/enrollments/course/:course_id/approve/:student_id
// ─────────────────────────────────────────────
const approveStudent = async (req, res) => {
  const { course_id, student_id } = req.params;
  const instructor_id = req.user.user_id;

  try {
    // Verify course ownership
    const course = await pool.query(
      "SELECT course_id FROM courses WHERE course_id = $1 AND instructor_id = $2",
      [course_id, instructor_id]
    );

    if (course.rowCount === 0) {
      return res.status(403).json({ message: "Course not found or unauthorized." });
    }

    // Check student exists and is a legit student (role check)
    const studentCheck = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email, r.role_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = $1`,
      [student_id]
    );

    if (studentCheck.rowCount === 0) {
      return res.status(404).json({ message: "Student not found." });
    }

    const user = studentCheck.rows[0];

    // Only allow if role is 'student'
    if (user.role_name.toLowerCase() !== "student") {
      return res.status(403).json({
        message: `User is not a student. Their role is: ${user.role_name}.`,
      });
    }

    // Find their pending enrollment
    const enrollment = await pool.query(
      `SELECT * FROM enrollments
       WHERE course_id = $1 AND student_id = $2 AND status = 'pending'`,
      [course_id, student_id]
    );

    if (enrollment.rowCount === 0) {
      return res.status(404).json({
        message: "No pending enrollment found for this student.",
      });
    }

    // Approve
    const result = await pool.query(
      `UPDATE enrollments SET status = 'enrolled'
       WHERE course_id = $1 AND student_id = $2
       RETURNING *`,
      [course_id, student_id]
    );

    return res.status(200).json({
      message: `${user.first_name} ${user.last_name} has been approved and enrolled.`,
      enrollment: result.rows[0],
    });
  } catch (err) {
    console.error("approveStudent error:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// INSTRUCTOR or STUDENT — Unenroll / Drop
// DELETE /api/enrollments/course/:course_id/unenroll/:student_id
// - Instructor can unenroll any student
// - Student can unenroll themselves
// ─────────────────────────────────────────────
const unenrollStudent = async (req, res) => {
  const { course_id, student_id } = req.params;
  const requester_id = req.user.user_id;

  try {
    // Check if requester is the instructor of the course
    const course = await pool.query(
      "SELECT instructor_id FROM courses WHERE course_id = $1",
      [course_id]
    );

    if (course.rowCount === 0) {
      return res.status(404).json({ message: "Course not found." });
    }

    const isInstructor = course.rows[0].instructor_id === requester_id;
    const isSelf = requester_id === parseInt(student_id);

    // Only instructor or the student themselves can unenroll
    if (!isInstructor && !isSelf) {
      return res.status(403).json({ message: "Unauthorized action." });
    }

    const result = await pool.query(
      `DELETE FROM enrollments
       WHERE course_id = $1 AND student_id = $2
       RETURNING *`,
      [course_id, student_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Enrollment not found." });
    }

    return res.status(200).json({
      message: isInstructor
        ? "Student has been unenrolled from the course."
        : "You have successfully dropped this course.",
    });
  } catch (err) {
    console.error("unenrollStudent error:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
};

module.exports = {
  getEnrolledStudents,
  getMyCourses,
  getEnrollmentStatus,
  approveStudent,
  unenrollStudent,
};