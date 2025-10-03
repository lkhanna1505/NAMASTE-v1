const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { config: oauthConfig, helpers: oauthHelpers } = require('../config/oauth');
const auditService = require('../services/audit.service');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class AuthController {
  // User login with ABHA ID
  async login(req, res, next) {
    try {
      const { abha_id, password } = req.body;
      
      if (!abha_id || !password) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'ABHA ID and password are required'
        });
      }

      // Validate ABHA ID format
      if (!helpers.validateAbhaId(abha_id)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid ABHA ID format'
        });
      }

      // Find user by ABHA ID
      const user = await User.findOne({ 
        where: { abha_id, is_active: true } 
      });

      if (!user) {
        // Log failed login attempt
        await auditService.logAction({
          action: 'LOGIN_FAILED',
          resource_type: 'authentication',
          ip_address: req.ip,
          user_agent: req.get('User-Agent'),
          additional_info: { abha_id, reason: 'user_not_found' }
        });

        return res.status(401).json({
          error: 'Authentication Failed',
          message: 'Invalid credentials'
        });
      }

      // Validate password
      const isPasswordValid = await user.validatePassword(password);
      if (!isPasswordValid) {
        // Log failed login attempt
        await auditService.logAction({
          user_id: user.id,
          action: 'LOGIN_FAILED',
          resource_type: 'authentication',
          ip_address: req.ip,
          user_agent: req.get('User-Agent'),
          additional_info: { reason: 'invalid_password' }
        });

        return res.status(401).json({
          error: 'Authentication Failed',
          message: 'Invalid credentials'
        });
      }

      // Generate JWT tokens
      const accessToken = jwt.sign(
        { 
          userId: user.id, 
          abhaId: user.abha_id,
          role: user.role 
        },
        oauthConfig.jwt.secret,
        { 
          expiresIn: oauthConfig.jwt.expiresIn,
          issuer: oauthConfig.jwt.issuer,
          audience: oauthConfig.jwt.audience
        }
      );

      const refreshToken = jwt.sign(
        { userId: user.id },
        oauthConfig.jwt.secret,
        { expiresIn: oauthConfig.jwt.refreshExpiresIn }
      );

      // Update user login info
      await user.update({
        last_login: new Date(),
        refresh_token: refreshToken
      });

      // Log successful login
      await auditService.logAction({
        user_id: user.id,
        action: 'LOGIN_SUCCESS',
        resource_type: 'authentication',
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

      res.json({
        message: 'Login successful',
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: oauthConfig.jwt.expiresIn,
        token_type: 'Bearer',
        user: user
      });

    } catch (error) {
      logger.error('Login error:', error);
      next(error);
    }
  }

  // User registration
  async register(req, res, next) {
    try {
      const { abha_id, email, name, password, role = 'clinician' } = req.body;

      // Validate required fields
      if (!abha_id || !name || !password) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'ABHA ID, name, and password are required'
        });
      }

      // Validate ABHA ID format
      if (!helpers.validateAbhaId(abha_id)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid ABHA ID format'
        });
      }

      // Validate email format if provided
      if (email && !helpers.isValidEmail(email)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid email format'
        });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ 
        where: { abha_id } 
      });

      if (existingUser) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'User with this ABHA ID already exists'
        });
      }

      // Hash password
      const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create new user
      const newUser = await User.create({
        abha_id,
        email,
        name,
        password_hash: hashedPassword,
        role,
        is_active: true
      });

      // Generate tokens
      const accessToken = jwt.sign(
        { 
          userId: newUser.id, 
          abhaId: newUser.abha_id,
          role: newUser.role 
        },
        oauthConfig.jwt.secret,
        { 
          expiresIn: oauthConfig.jwt.expiresIn,
          issuer: oauthConfig.jwt.issuer,
          audience: oauthConfig.jwt.audience
        }
      );

      const refreshToken = jwt.sign(
        { userId: newUser.id },
        oauthConfig.jwt.secret,
        { expiresIn: oauthConfig.jwt.refreshExpiresIn }
      );

      // Update user with refresh token
      await newUser.update({ refresh_token: refreshToken });

      // Log registration
      await auditService.logAction({
        user_id: newUser.id,
        action: 'USER_REGISTERED',
        resource_type: 'user',
        resource_id: newUser.id.toString(),
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

      res.status(201).json({
        message: 'User registered successfully',
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: oauthConfig.jwt.expiresIn,
        token_type: 'Bearer',
        user: newUser
      });

    } catch (error) {
      logger.error('Registration error:', error);
      next(error);
    }
  }

  // Refresh access token
  async refreshToken(req, res, next) {
    try {
      const { refresh_token } = req.body;

      if (!refresh_token) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Refresh token is required'
        });
      }

      // Verify refresh token
      const decoded = jwt.verify(refresh_token, oauthConfig.jwt.secret);
      
      // Find user and validate refresh token
      const user = await User.findOne({
        where: { 
          id: decoded.userId,
          refresh_token,
          is_active: true
        }
      });

      if (!user) {
        return res.status(401).json({
          error: 'Authentication Failed',
          message: 'Invalid refresh token'
        });
      }

      // Generate new tokens
      const newAccessToken = jwt.sign(
        { 
          userId: user.id, 
          abhaId: user.abha_id,
          role: user.role 
        },
        oauthConfig.jwt.secret,
        { 
          expiresIn: oauthConfig.jwt.expiresIn,
          issuer: oauthConfig.jwt.issuer,
          audience: oauthConfig.jwt.audience
        }
      );

      const newRefreshToken = jwt.sign(
        { userId: user.id },
        oauthConfig.jwt.secret,
        { expiresIn: oauthConfig.jwt.refreshExpiresIn }
      );

      // Update refresh token in database
      await user.update({ refresh_token: newRefreshToken });

      // Log token refresh
      await auditService.logAction({
        user_id: user.id,
        action: 'TOKEN_REFRESHED',
        resource_type: 'authentication',
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

      res.json({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        expires_in: oauthConfig.jwt.expiresIn,
        token_type: 'Bearer'
      });

    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Authentication Failed',
          message: 'Invalid or expired refresh token'
        });
      }
      logger.error('Token refresh error:', error);
      next(error);
    }
  }

  // User logout
  async logout(req, res, next) {
    try {
      const userId = req.user.id;

      // Clear refresh token
      await User.update(
        { refresh_token: null },
        { where: { id: userId } }
      );

      // Log logout
      await auditService.logAction({
        user_id: userId,
        action: 'LOGOUT',
        resource_type: 'authentication',
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

      res.json({
        message: 'Logged out successfully'
      });

    } catch (error) {
      logger.error('Logout error:', error);
      next(error);
    }
  }

  // Get user profile
  async getProfile(req, res, next) {
    try {
      const user = req.user;

      res.json({
        user: {
          id: user.id,
          abha_id: user.abha_id,
          name: user.name,
          email: user.email,
          role: user.role,
          is_active: user.is_active,
          last_login: user.last_login,
          created_at: user.created_at
        }
      });

    } catch (error) {
      logger.error('Get profile error:', error);
      next(error);
    }
  }

  // ABHA OAuth callback
  async abhaCallback(req, res, next) {
    try {
      const { code, state } = req.query;

      if (!code) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Authorization code is required'
        });
      }

      // Exchange code for access token
      const tokenResponse = await oauthHelpers.exchangeAbhaCode(code, state);
      
      // Get user profile from ABHA
      const abhaProfile = await oauthHelpers.getAbhaUserProfile(tokenResponse.access_token);

      // Find or create user
      let user = await User.findOne({ 
        where: { abha_id: abhaProfile.abha_id } 
      });

      if (!user) {
        // Create new user from ABHA profile
        user = await User.create({
          abha_id: abhaProfile.abha_id,
          name: abhaProfile.name,
          email: abhaProfile.email,
          role: 'clinician',
          is_active: true
        });
      }

      // Generate JWT token
      const accessToken = jwt.sign(
        { 
          userId: user.id, 
          abhaId: user.abha_id,
          role: user.role 
        },
        oauthConfig.jwt.secret,
        { 
          expiresIn: oauthConfig.jwt.expiresIn,
          issuer: oauthConfig.jwt.issuer,
          audience: oauthConfig.jwt.audience
        }
      );

      // Log OAuth login
      await auditService.logAction({
        user_id: user.id,
        action: 'OAUTH_LOGIN',
        resource_type: 'authentication',
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        additional_info: { provider: 'abha' }
      });

      // Redirect to frontend with token
      const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/auth/success?token=${accessToken}`;
      res.redirect(redirectUrl);

    } catch (error) {
      logger.error('ABHA OAuth callback error:', error);
      const errorUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/auth/error?message=oauth_failed`;
      res.redirect(errorUrl);
    }
  }

  // Initiate ABHA OAuth flow
  async initiateAbhaAuth(req, res, next) {
    try {
      const state = helpers.generateSecureId(16);
      const authUrl = oauthHelpers.generateAbhaAuthUrl(state);

      // Store state in session or cache for validation
      req.session = req.session || {};
      req.session.oauthState = state;

      res.json({
        auth_url: authUrl,
        state: state
      });

    } catch (error) {
      logger.error('ABHA OAuth initiation error:', error);
      next(error);
    }
  }
}

module.exports = new AuthController();
