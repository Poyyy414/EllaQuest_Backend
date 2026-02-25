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

router.get('/dashboard', authMiddleware, authorizeRoles('admin'), getDashboardStats);
router.get('/users', authMiddleware, authorizeRoles('admin'), getAllUsers);
router.get('/users/:id', authMiddleware, authorizeRoles('admin'), getUserById);
router.put('/users/:id', authMiddleware, authorizeRoles('admin'), updateUser);
router.delete('/users/:id', authMiddleware, authorizeRoles('admin'), deleteUser);
router.get('/students', authMiddleware, authorizeRoles('admin'), getAllStudents);
router.get('/instructors', authMiddleware, authorizeRoles('admin'), getAllInstructors);
router.get('/curriculum-managers', authMiddleware, authorizeRoles('admin'), getAllCurriculumManagers);

module.exports = router;