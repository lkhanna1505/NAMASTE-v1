const axios = require('axios');
const { ICD11Code } = require('../models');
const logger = require('../utils/logger');

class ICD11Service {
  constructor() {
    this.baseURL = process.env.ICD11_API_URL || 'https://icd-api.who.int/icd';
    this.clientId = process.env.ICD11_CLIENT_ID;
    this.clientSecret = process.env.ICD11_CLIENT_SECRET;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(
        'https://icdaccessmanagement.who.int/connect/token',
        'grant_type=client_credentials&scope=icdapi_access',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      return this.accessToken;
    } catch (error) {
      logger.error('Failed to get ICD-11 access token:', error);
      throw new Error('ICD-11 authentication failed');
    }
  }

  async searchICD11(query, module = 'mms', limit = 20) {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(`${this.baseURL}/entity/search`, {
        params: {
          q: query,
          subtreeFilterUsesFoundationDescendants: false,
          includeKeywordResult: true,
          useFlexisearch: false,
          flatResults: true,
          highlightingEnabled: false
        },
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Accept-Language': 'en',
          'API-Version': 'v2'
        }
      });

      return response.data.destinationEntities || [];
    } catch (error) {
      logger.error('ICD-11 search failed:', error);
      throw new Error('ICD-11 search failed');
    }
  }

  async getEntityDetails(entityId) {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(`${this.baseURL}/entity/${entityId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Accept-Language': 'en',
          'API-Version': 'v2'
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get ICD-11 entity details:', error);
      throw new Error('Failed to get entity details');
    }
  }

  async syncTM2Module() {
    try {
      logger.info('Starting ICD-11 TM2 module sync...');
      
      // Get TM2 root entities
      const tm2Root = await this.getEntityDetails('1435254666'); // TM2 root
      
      const entitiesToSync = [
        '1435254666', // Constitutional patterns
        '1435254667', // Functional signs
        '1435254668', // Therapeutic procedures
        // Add more TM2 entity IDs as needed
      ];

      let syncCount = 0;
      
      for (const entityId of entitiesToSync) {
        try {
          const entityData = await this.getEntityDetails(entityId);
          
          await ICD11Code.findOrCreate({
            where: { icd_id: entityId },
            defaults: {
              icd_id: entityId,
              code: entityData.code || null,
              title: entityData.title?.['@value'] || entityData.title || 'Unknown',
              definition: entityData.definition?.['@value'] || entityData.definition || null,
              module: 'tm2',
              parent_id: entityData.parent?.[0] || null,
              level: this.calculateLevel(entityData.breadcrumb || []),
              synonyms: this.extractSynonyms(entityData),
              who_metadata: {
                browserUrl: entityData.browserUrl,
                classKind: entityData.classKind,
                lastModified: entityData.lastModified
              }
            }
          });
          
          syncCount++;
          
          // Rate limiting - WHO API has limits
          await this.delay(100);
        } catch (entityError) {
          logger.error(`Failed to sync entity ${entityId}:`, entityError);
        }
      }

      logger.info(`ICD-11 TM2 sync completed. Synced ${syncCount} entities.`);
      return { synced: syncCount, total: entitiesToSync.length };
    } catch (error) {
      logger.error('ICD-11 TM2 sync failed:', error);
      throw error;
    }
  }

  calculateLevel(breadcrumb) {
    return Array.isArray(breadcrumb) ? Math.max(0, breadcrumb.length - 1) : 0;
  }

  extractSynonyms(entityData) {
    const synonyms = [];
    
    if (entityData.synonym) {
      entityData.synonym.forEach(syn => {
        if (syn.label && syn.label['@value']) {
          synonyms.push(syn.label['@value']);
        }
      });
    }
    
    return synonyms;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async autocomplete(query, limit = 10) {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(`${this.baseURL}/entity/autocomplete`, {
        params: {
          q: query,
          subtreeFilterUsesFoundationDescendants: false,
          useFlexisearch: true,
          flatResults: true
        },
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Accept-Language': 'en',
          'API-Version': 'v2'
        }
      });

      return (response.data.words || []).slice(0, limit);
    } catch (error) {
      logger.error('ICD-11 autocomplete failed:', error);
      return [];
    }
  }
}

module.exports = new ICD11Service();
