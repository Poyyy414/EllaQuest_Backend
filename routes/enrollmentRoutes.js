const express = require("express");
const router = express.Router();
const { authMiddleware: auth } = require("../middleware/authMiddleware");
const {
  getEnrolledStudents,
  getMyCourses,
  getEnrollmentStatus,
  approveStudent,
  unenrollStudent,
} = require("../controllers/enrollmentController");

// ── Instructor Routes ──────────────────────────────────────────────
// Get all enrolled students in a course
router.get("/course/:course_id/students",               auth, getEnrolledStudents);

// Approve a student (checks if legit student role)
router.patch("/course/:course_id/approve/:student_id",  auth, approveStudent);

// Unenroll a student from a course (instructor or self)
router.delete("/course/:course_id/unenroll/:student_id", auth, unenrollStudent);

// ── Student Routes ─────────────────────────────────────────────────
// Get enrollment status for a specific course
router.get("/course/:course_id/status",                 auth, getEnrollmentStatus);

module.exports = router;