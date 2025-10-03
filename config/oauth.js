const dotenv = require('dotenv');
const axios = require('axios');
const logger = require('../utils/logger');
dotenv.config();

const oauthConfig = {
  // ABHA OAuth Configuration
  abha: {
    client: {
      id: process.env.ABHA_CLIENT_ID || 'your_abha_client_id',
      secret: process.env.ABHA_CLIENT_SECRET || 'your_abha_client_secret'
    },
    auth: {
      tokenHost: process.env.ABHA_BASE_URL || 'https://abhasbx.abdm.gov.in',
      tokenPath: '/api/v1/auth/authConfirm',
      authorizePath: '/api/v1/auth/authorize',
      profilePath: '/api/v1/profile',
      revokePath: '/api/v1/auth/logout'
    },
    scopes: ['openid', 'profile', 'abha-enrol', 'mobile', 'email'],
    redirectUri: process.env.ABHA_REDIRECT_URI || 'http://localhost:3000/api/auth/callback'
  },

  // WHO ICD-11 OAuth Configuration
  icd11: {
    client: {
      id: process.env.ICD11_CLIENT_ID || 'your_icd11_client_id',
      secret: process.env.ICD11_CLIENT_SECRET || 'your_icd11_client_secret'
    },
    auth: {
      tokenHost: 'https://icdaccessmanagement.who.int',
      tokenPath: '/connect/token',
      scope: 'icdapi_access'
    }
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
    issuer: process.env.JWT_ISSUER || 'namaste-icd11-api',
    audience: process.env.JWT_AUDIENCE || 'healthcare-users'
  }
};

// OAuth Helper Functions
const oauthHelpers = {
  // Generate ABHA authorization URL
  generateAbhaAuthUrl(state = null) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: oauthConfig.abha.client.id,
      redirect_uri: oauthConfig.abha.redirectUri,
      scope: oauthConfig.abha.scopes.join(' '),
      state: state || Math.random().toString(36).substring(7)
    });

    return `${oauthConfig.abha.auth.tokenHost}${oauthConfig.abha.auth.authorizePath}?${params}`;
  },

  // Exchange ABHA authorization code for access token
  async exchangeAbhaCode(authCode, state) {
    try {
      const response = await axios.post(
        `${oauthConfig.abha.auth.tokenHost}${oauthConfig.abha.auth.tokenPath}`,
        {
          grant_type: 'authorization_code',
          client_id: oauthConfig.abha.client.id,
          client_secret: oauthConfig.abha.client.secret,
          code: authCode,
          redirect_uri: oauthConfig.abha.redirectUri,
          state: state
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error('ABHA token exchange failed:', error);
      throw new Error('Failed to exchange ABHA authorization code');
    }
  },

  // Get ABHA user profile
  async getAbhaUserProfile(accessToken) {
    try {
      const response = await axios.get(
        `${oauthConfig.abha.auth.tokenHost}${oauthConfig.abha.auth.profilePath}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error('ABHA profile fetch failed:', error);
      throw new Error('Failed to fetch ABHA user profile');
    }
  },

  // Get ICD-11 access token
  async getIcd11AccessToken() {
    try {
      const credentials = Buffer.from(
        `${oauthConfig.icd11.client.id}:${oauthConfig.icd11.client.secret}`
      ).toString('base64');

      const response = await axios.post(
        `${oauthConfig.icd11.auth.tokenHost}${oauthConfig.icd11.auth.tokenPath}`,
        'grant_type=client_credentials&scope=' + oauthConfig.icd11.auth.scope,
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error('ICD-11 token request failed:', error);
      throw new Error('Failed to get ICD-11 access token');
    }
  },

  // Validate OAuth token
  async validateToken(token, provider = 'abha') {
    try {
      if (provider === 'abha') {
        return await this.getAbhaUserProfile(token);
      } else if (provider === 'icd11') {
        // ICD-11 token validation logic
        return { valid: true };
      }
    } catch (error) {
      return { valid: false, error: error.message };
    }
  },

  // Revoke OAuth token
  async revokeToken(token, provider = 'abha') {
    try {
      if (provider === 'abha') {
        await axios.post(
          `${oauthConfig.abha.auth.tokenHost}${oauthConfig.abha.auth.revokePath}`,
          { token },
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
      }
      return { revoked: true };
    } catch (error) {
      logger.error('Token revocation failed:', error);
      return { revoked: false, error: error.message };
    }
  }
};

module.exports = {
  config: oauthConfig,
  helpers: oauthHelpers
};
