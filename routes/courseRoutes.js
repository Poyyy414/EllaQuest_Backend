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

router.post("/create/course",                                   auth, createCourse);
router.patch("/generate-code/:course_id",        auth, regenerateCourseCode);
router.get("/course/:course_id/pending",                  auth, getPendingRequests);
router.patch("/course/:course_id/enrollment/:enrollment_id",  auth, handleEnrollment);
router.get("/course/:course_id",                          auth, getCourse);
router.post("/course/:course_id/join",                               auth, joinCourse);

module.exports = router;