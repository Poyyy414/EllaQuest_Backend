const pool = require("../config/database");

// ─────────────────────────────────────────────
// INSTRUCTOR — Get All Enrolled Students in a Course
// GET /api/enrollments/course/:course_id/students
// ─────────────────────────────────────────────
const getEnrolledStudents = async (req, res) => {
  const { course_id } = req.params;
  const instructor_id = req.user.user_id;

  try {
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
// STUDENT — Get Enrollment Status for a Course
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
// INSTRUCTOR — Approve Student (verify legit student role)
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

    // Check student exists and verify role is 'student'
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

    if (user.role_name.toLowerCase() !== "student") {
      return res.status(403).json({
        message: `User is not a student. Their role is: ${user.role_name}.`,
      });
    }

    // Check there is a pending enrollment
    const enrollment = await pool.query(
      `SELECT * FROM enrollments
       WHERE course_id = $1 AND student_id = $2 AND status = 'pending'`,
      [course_id, student_id]
    );

    if (enrollment.rowCount === 0) {
      return res.status(404).json({ message: "No pending enrollment found for this student." });
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
// ─────────────────────────────────────────────
const unenrollStudent = async (req, res) => {
  const { course_id, student_id } = req.params;
  const requester_id = req.user.user_id;

  try {
    const course = await pool.query(
      "SELECT instructor_id FROM courses WHERE course_id = $1",
      [course_id]
    );

    if (course.rowCount === 0) {
      return res.status(404).json({ message: "Course not found." });
    }

    const isInstructor = course.rows[0].instructor_id === requester_id;
    const isSelf = requester_id === parseInt(student_id);

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
  getEnrollmentStatus,
  approveStudent,
  unenrollStudent,
};