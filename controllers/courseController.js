const pool = require("../config/database");
const crypto = require("crypto");

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const generateCourseCode = () =>
  crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 6);

// ─────────────────────────────────────────────
// INSTRUCTOR — Create a Course
// POST /api/courses/create
// Body: { title, description }
// ─────────────────────────────────────────────
const createCourse = async (req, res) => {
  const { title, description } = req.body;
  const instructor_id = req.user.user_id;

  if (!title) {
    return res.status(400).json({ message: "Title is required." });
  }

  try {
    let course_code;
    let isUnique = false;

    while (!isUnique) {
      course_code = generateCourseCode();
      const existing = await pool.query(
        "SELECT course_id FROM courses WHERE course_code = $1",
        [course_code]
      );
      if (existing.rowCount === 0) isUnique = true;
    }

    const result = await pool.query(
      `INSERT INTO courses (instructor_id, title, description, course_code, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [instructor_id, title, description, course_code]
    );

    return res.status(201).json({
      message: "Course created successfully.",
      course: result.rows[0],
    });
  } catch (err) {
    console.error("createCourse error:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// INSTRUCTOR — Regenerate Course Code
// PATCH /api/courses/:course_id/regenerate-code
// ─────────────────────────────────────────────
const regenerateCourseCode = async (req, res) => {
  const { course_id } = req.params;
  const instructor_id = req.user.user_id;

  try {
    const course = await pool.query(
      "SELECT * FROM courses WHERE course_id = $1 AND instructor_id = $2",
      [course_id, instructor_id]
    );

    if (course.rowCount === 0) {
      return res.status(403).json({ message: "Course not found or unauthorized." });
    }

    let course_code;
    let isUnique = false;

    while (!isUnique) {
      course_code = generateCourseCode();
      const existing = await pool.query(
        "SELECT course_id FROM courses WHERE course_code = $1",
        [course_code]
      );
      if (existing.rowCount === 0) isUnique = true;
    }

    const result = await pool.query(
      `UPDATE courses SET course_code = $1, updated_at = NOW()
       WHERE course_id = $2
       RETURNING course_id, title, course_code`,
      [course_code, course_id]
    );

    return res.status(200).json({
      message: "Course code regenerated.",
      course: result.rows[0],
    });
  } catch (err) {
    console.error("regenerateCourseCode error:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// STUDENT — Join Course via Code (status: pending)
// POST /api/courses/join
// Body: { course_code }
// ─────────────────────────────────────────────
const joinCourse = async (req, res) => {
  const { course_code } = req.body;
  const student_id = req.user.user_id;

  if (!course_code) {
    return res.status(400).json({ message: "Course code is required." });
  }

  try {
    const courseResult = await pool.query(
      "SELECT * FROM courses WHERE course_code = $1",
      [course_code.toUpperCase()]
    );

    if (courseResult.rowCount === 0) {
      return res.status(404).json({ message: "Invalid course code." });
    }

    const course = courseResult.rows[0];

    if (course.instructor_id === student_id) {
      return res.status(400).json({ message: "Instructors cannot join their own course." });
    }

    const existing = await pool.query(
      `SELECT * FROM enrollments WHERE course_id = $1 AND student_id = $2`,
      [course.course_id, student_id]
    );

    if (existing.rowCount > 0) {
      const status = existing.rows[0].status;
      return res.status(409).json({
        message:
          status === "pending"
            ? "You already have a pending request for this course."
            : "You are already enrolled in this course.",
      });
    }

    await pool.query(
      `INSERT INTO enrollments (course_id, student_id, status, joined_at)
       VALUES ($1, $2, 'pending', NOW())`,
      [course.course_id, student_id]
    );

    return res.status(200).json({
      message: "Join request sent. You will be enrolled once the instructor approves.",
      course: {
        course_id: course.course_id,
        title: course.title,
      },
    });
  } catch (err) {
    console.error("joinCourse error:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// INSTRUCTOR — Get Pending Requests
// GET /api/courses/:course_id/pending
// ─────────────────────────────────────────────
const getPendingRequests = async (req, res) => {
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
      `SELECT e.enrollment_id, e.student_id, e.joined_at,
              u.first_name, u.last_name, u.email
       FROM enrollments e
       JOIN users u ON u.user_id = e.student_id
       WHERE e.course_id = $1 AND e.status = 'pending'
       ORDER BY e.joined_at ASC`,
      [course_id]
    );

    return res.status(200).json({ pending: result.rows });
  } catch (err) {
    console.error("getPendingRequests error:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// INSTRUCTOR — Approve or Reject Enrollment
// PATCH /api/courses/:course_id/enrollment/:enrollment_id
// Body: { action: "approve" | "reject" }
// ─────────────────────────────────────────────
const handleEnrollment = async (req, res) => {
  const { course_id, enrollment_id } = req.params;
  const { action } = req.body;
  const instructor_id = req.user.user_id;

  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({ message: 'Action must be "approve" or "reject".' });
  }

  try {
    const course = await pool.query(
      "SELECT course_id FROM courses WHERE course_id = $1 AND instructor_id = $2",
      [course_id, instructor_id]
    );

    if (course.rowCount === 0) {
      return res.status(403).json({ message: "Course not found or unauthorized." });
    }

    const newStatus = action === "approve" ? "enrolled" : "rejected";

    const result = await pool.query(
      `UPDATE enrollments SET status = $1
       WHERE enrollment_id = $2 AND course_id = $3 AND status = 'pending'
       RETURNING *`,
      [newStatus, enrollment_id, course_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Enrollment request not found or already handled." });
    }

    return res.status(200).json({
      message: `Student has been ${newStatus}.`,
      enrollment: result.rows[0],
    });
  } catch (err) {
    console.error("handleEnrollment error:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// GET Course Details
// GET /api/courses/:course_id
// ─────────────────────────────────────────────
const getCourse = async (req, res) => {
  const { course_id } = req.params;
  const user_id = req.user.user_id;

  try {
    const result = await pool.query(
      "SELECT * FROM courses WHERE course_id = $1",
      [course_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Course not found." });
    }

    const course = result.rows[0];
    const isInstructor = course.instructor_id === user_id;

    if (!isInstructor) {
      const enrollment = await pool.query(
        `SELECT status FROM enrollments
         WHERE course_id = $1 AND student_id = $2`,
        [course_id, user_id]
      );

      if (enrollment.rowCount === 0 || enrollment.rows[0].status !== "enrolled") {
        return res.status(403).json({ message: "Access denied. You are not enrolled." });
      }
    }

    if (!isInstructor) delete course.course_code;

    return res.status(200).json({ course });
  } catch (err) {
    console.error("getCourse error:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// STUDENT — Get All My Enrolled Courses
// GET /api/courses/my-courses
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
       WHERE e.student_id = $1 AND e.status = 'enrolled'
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

module.exports = {
  createCourse,
  regenerateCourseCode,
  joinCourse,
  getPendingRequests,
  handleEnrollment,
  getCourse,
  getMyCourses,
};