const express = require('express');
const router = express.Router();
const {
    getAllUsers,
    getAllStudents,
    getAllInstructors,
    getAllCurriculumManagers,
    getUserById,
    updateUser,
    deleteUser,
    getDashboardStats
} = require('../controllers/adminController');

const { authMiddleware, authorizeRoles } = require('../middleware/authMiddleware');

router.get('/admin/dashboard', authMiddleware, authorizeRoles('admin'), getDashboardStats);
router.get('/admin/users', authMiddleware, authorizeRoles('admin'), getAllUsers);
router.get('/admin/users/:id', authMiddleware, authorizeRoles('admin'), getUserById);
router.put('/admin/users/:id', authMiddleware, authorizeRoles('admin'), updateUser);
router.delete('/admin/users/:id', authMiddleware, authorizeRoles('admin'), deleteUser);
router.get('/admin/students', authMiddleware, authorizeRoles('admin'), getAllStudents);
router.get('/admin/instructors', authMiddleware, authorizeRoles('admin'), getAllInstructors);
router.get('/admin/curriculum-managers', authMiddleware, authorizeRoles('admin'), getAllCurriculumManagers);

module.exports = router;