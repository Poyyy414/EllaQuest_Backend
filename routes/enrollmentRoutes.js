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
router.get("/enrollment/course/:course_id/students",             auth, getEnrolledStudents);

// Approve a student (checks if legit student role)
router.patch("/enrollment/course/:course_id/approve/:student_id", auth, approveStudent);

// Unenroll a student from a course (instructor or self)
router.delete("/enrollment/course/:course_id/unenroll/:student_id", auth, unenrollStudent);

// ── Student Routes ─────────────────────────────────────────────────
// Get all courses the logged-in student is enrolled in
router.get("/enrollment/my-courses",                             auth, getMyCourses);

// Get enrollment status for a specific course
router.get("/enrollment/course/:course_id/status",               auth, getEnrollmentStatus);

module.exports = router;