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
} = require("../controllers/courseController");

router.post("/create",                                   auth, createCourse);
router.patch("/:course_id/regenerate-code",        auth, regenerateCourseCode);
router.get("/:course_id/pending",                  auth, getPendingRequests);
router.patch("/:course_id/enrollment/:enrollment_id", auth, handleEnrollment);

// ── Shared Routes ──────────────────────────────────────
router.get("/:course_id",                          auth, getCourse);

// ── Student Routes ─────────────────────────────────────
router.post("/join",                               auth, joinCourse);

module.exports = router;