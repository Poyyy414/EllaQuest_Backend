const express = require('express');
const { createAccount } = require('../controllers/userController');
const { register, login } = require('../controllers/userController');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/create-account', createAccount); // for admin/curriculum_manager only

module.exports = router;