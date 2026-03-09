const express = require('express');
const { createAccount } = require('../controllers/userController');
const { register, login, createAccount, sendVerificationCode } = require('../controllers/userController');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/send-verification-code', sendVerificationCode);
router.post('/create-account', createAccount);



module.exports = router;