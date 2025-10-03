const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');
const { User } = require('../models');
const { authenticateToken } = require('../middleware/auth.middleware');
const { validateCreateUser } = require('../middleware/validation.middleware');

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User login
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - abha_id
 *             properties:
 *               abha_id:
 *                 type: string
 *               password:
 *                 type: string
 */
router.post('/login', async (req, res) => {
  try {
    const { abha_id, password } = req.body;
    
    if (!abha_id) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'ABHA ID is required'
      });
    }

    const result = await authService.login(abha_id, password);
    
    res.json({
      message: 'Login successful',
      user: result.user,
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      expires_in: process.env.JWT_EXPIRES_IN || '24h'
    });
  } catch (error) {
    res.status(401).json({
      error: 'Authentication Failed',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: User registration
 *     tags: [Authentication]
 */
router.post('/register', validateCreateUser, async (req, res) => {
  try {
    const { abha_id, email, name, password, role } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ where: { abha_id } });
    if (existingUser) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'User with this ABHA ID already exists'
      });
    }

    const user = await User.create({
      abha_id,
      email,
      name,
      password_hash: password,
      role: role || 'clinician'
    });

    const tokens = authService.generateTokens(user);
    await user.update({ refresh_token: tokens.refreshToken });

    res.status(201).json({
      message: 'User created successfully',
      user: user,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    
    if (!refresh_token) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Refresh token required'
      });
    }

    const tokens = await authService.refreshAccessToken(refresh_token);
    
    res.json({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in: process.env.JWT_EXPIRES_IN || '24h'
    });
  } catch (error) {
    res.status(401).json({
      error: 'Authentication Failed',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: Get user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 */
router.get('/profile', authenticateToken, (req, res) => {
  res.json({
    user: req.user
  });
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: User logout
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 */
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await authService.logout(req.user.id);
    res.json({
      message: 'Logged out successfully'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

module.exports = router;
