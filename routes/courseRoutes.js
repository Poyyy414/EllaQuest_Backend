const express = require("express");
const router = express.Router();
const { authMiddleware: auth } = require("../middleware/authMiddleware");
const {
  createCourse,
  regenerateCourseCode,
  joinCourse,
  getPendingRequests,
  handleEnrollment,
  getCourse,
  getMyCourses,
} = require("../controllers/courseController");

// ── Instructor Routes ──────────────────────────────────
router.post("/create",                                    auth, createCourse);
router.patch("/:course_id/regenerate-code",               auth, regenerateCourseCode);
router.get("/:course_id/pending",                         auth, getPendingRequests);
router.patch("/:course_id/enrollment/:enrollment_id",     auth, handleEnrollment);

// ── Student Routes ─────────────────────────────────────
router.post("/join",                                      auth, joinCourse);      // Body: { course_code }
router.get("/my-courses",                                 auth, getMyCourses);    // Get all my enrolled courses

// ── Shared Routes ──────────────────────────────────────
router.get("/:course_id",                                 auth, getCourse);

module.exports = router;