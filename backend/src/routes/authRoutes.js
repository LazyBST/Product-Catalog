const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Login route
router.post('/login', authController.loginUser);

// Signup route
router.post('/signup', authController.signupUser);

module.exports = router; 