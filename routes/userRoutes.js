const express = require('express');
const { registerSSO, login, createAccount, googleAuth, googleCallback} = require('../controllers/userController');

const router = express.Router();

router.post('/register-sso', registerSSO);
router.post('/login', login);
router.post('/create-account', createAccount);
router.get('/google',           googleAuth); 
router.get('/google/callback',  googleCallback);


module.exports = router;