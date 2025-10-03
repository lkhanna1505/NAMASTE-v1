const { sequelize, CodeMapping, NamesteCode, ICD11Code } = require('../models');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class MappingCreator {
  constructor() {
    this.stats = {
      processed: 0,
      created: 0,
      skipped: 0,
      errors: 0
    };
  }

  // Create a single mapping
  async createMapping(namasteCode, icd11Code, mappingType = 'equivalent', confidenceScore = null, notes = null) {
    try {
      // Verify NAMASTE code exists
      const namasteEntity = await NamesteCode.findOne({
        where: { code: namasteCode, status: 'active' }
      });

      if (!namasteEntity) {
        throw new Error(`NAMASTE code '${namasteCode}' not found or inactive`);
      }

      // Verify ICD-11 code exists
      const icd11Entity = await ICD11Code.findOne({
        where: { 
          [sequelize.Op.or]: [
            { icd_id: icd11Code },
            { code: icd11Code }
          ],
          status: 'active'
        }
      });

      if (!icd11Entity) {
        throw new Error(`ICD-11 code '${icd11Code}' not found or inactive`);
      }

      // Check if mapping already exists
      const existingMapping = await CodeMapping.findOne({
        where: {
          namaste_code: namasteCode,
          icd11_code: icd11Entity.icd_id,
          is_active: true
        }
      });

      if (existingMapping) {
        console.log(`Mapping already exists: ${namasteCode} -> ${icd11Entity.icd_id}`);
        this.stats.skipped++;
        return existingMapping;
      }

      // Calculate confidence score if not provided
      const calculatedConfidence = confidenceScore || 
        helpers.calculateMappingConfidence(namasteEntity.display_name, icd11Entity.title);

      // Create the mapping
      const mapping = await CodeMapping.create({
        namaste_code: namasteCode,
        icd11_code: icd11Entity.icd_id,
        mapping_type: mappingType,
        confidence_score: calculatedConfidence,
        notes: notes,
        is_active: true
      });

      console.log(`Created mapping: ${namasteCode} (${namasteEntity.display_name}) -> ${icd11Entity.icd_id} (${icd11Entity.title})`);
      this.stats.created++;
      return mapping;

    } catch (error) {
      console.error(`Error creating mapping ${namasteCode} -> ${icd11Code}:`, error.message);
      this.stats.errors++;
      throw error;
    } finally {
      this.stats.processed++;
    }
  }

  // Create mappings from array of objects
  async createMappingsFromArray(mappings) {
    console.log(`Starting batch creation of ${mappings.length} mappings...`);
    this.resetStats();

    for (const mapping of mappings) {
      try {
        await this.createMapping(
          mapping.namaste_code,
          mapping.icd11_code,
          mapping.mapping_type || 'equivalent',
          mapping.confidence_score,
          mapping.notes
        );
      } catch (error) {
        // Continue processing other mappings even if one fails
        continue;
      }
    }

    this.printStats();
    return this.stats;
  }

  // Create mappings from CSV data
  async createMappingsFromCSV(csvData) {
    const lines = csvData.split('\n');
    const header = lines[0].split(',').map(h => h.trim());
    
    console.log('CSV Header:', header);
    console.log(`Processing ${lines.length - 1} CSV rows...`);
    
    this.resetStats();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        
        if (values.length < 2) {
          console.warn(`Skipping invalid line ${i}: ${line}`);
          continue;
        }

        const mappingData = {
          namaste_code: values[0],
          icd11_code: values[1],
          mapping_type: values[2] || 'equivalent',
          confidence_score: values[3] ? parseFloat(values[3]) : null,
          notes: values[4] || null
        };

        await this.createMapping(
          mappingData.namaste_code,
          mappingData.icd11_code,
          mappingData.mapping_type,
          mappingData.confidence_score,
          mappingData.notes
        );

      } catch (error) {
        console.error(`Error processing line ${i}:`, error.message);
        continue;
      }
    }

    this.printStats();
    return this.stats;
  }

  // Create sample mappings for testing
  async createSampleMappings() {
    console.log('Creating sample NAMASTE to ICD-11 mappings...');
    this.resetStats();

    const sampleMappings = [
      {
        namaste_code: 'NAM001',
        icd11_code: '1435254666',
        mapping_type: 'equivalent',
        confidence_score: 0.95,
        notes: 'Direct mapping for Vata constitutional pattern'
      },
      {
        namaste_code: 'NAM002',
        icd11_code: '1435254666',
        mapping_type: 'equivalent',
        confidence_score: 0.95,
        notes: 'Direct mapping for Pitta constitutional pattern'
      },
      {
        namaste_code: 'NAM003',
        icd11_code: '1435254666',
        mapping_type: 'equivalent',
        confidence_score: 0.95,
        notes: 'Direct mapping for Kapha constitutional pattern'
      },
      {
        namaste_code: 'SID001',
        icd11_code: '1435254667',
        mapping_type: 'related',
        confidence_score: 0.8,
        notes: 'Siddha Vatham related to functional signs'
      },
      {
                namaste_code: 'UNA001',
        icd11_code: '1435254668',
        mapping_type: 'related',
        confidence_score: 0.85,
        notes: 'Unani Mizaj-e-Har related to therapeutic procedures'
      }
    ];

    await this.createMappingsFromArray(sampleMappings);
    return this.stats;
  }

  // Create mappings based on similarity matching
  async createAutomaticMappings(threshold = 0.7) {
    console.log(`Creating automatic mappings with confidence threshold: ${threshold}...`);
    this.resetStats();

    // Get all active NAMASTE codes
    const namasteCodes = await NamesteCode.findAll({
      where: { status: 'active' },
      attributes: ['code', 'display_name', 'system_type']
    });

    // Get all active TM2 ICD-11 codes
    const icd11Codes = await ICD11Code.findAll({
      where: { 
        status: 'active',
        module: 'tm2'
      },
      attributes: ['icd_id', 'title']
    });

    console.log(`Comparing ${namasteCodes.length} NAMASTE codes with ${icd11Codes.length} ICD-11 codes...`);

    for (const namasteCode of namasteCodes) {
      let bestMatch = null;
      let bestScore = 0;

      // Find best matching ICD-11 code
      for (const icd11Code of icd11Codes) {
        const score = helpers.calculateMappingConfidence(
          namasteCode.display_name,
          icd11Code.title
        );

        if (score > bestScore && score >= threshold) {
          bestScore = score;
          bestMatch = icd11Code;
        }
      }

      // Create mapping if good match found
      if (bestMatch) {
        try {
          await this.createMapping(
            namasteCode.code,
            bestMatch.icd_id,
            'equivalent',
            bestScore,
            `Automatically generated mapping (confidence: ${bestScore.toFixed(2)})`
          );
        } catch (error) {
          // Continue with next code
          continue;
        }
      }
    }

    this.printStats();
    return this.stats;
  }

  // Validate existing mappings
  async validateMappings() {
    console.log('Validating existing mappings...');
    
    const mappings = await CodeMapping.findAll({
      where: { is_active: true },
      include: [
        { association: 'namasteCodeDetails' },
        { association: 'icd11CodeDetails' }
      ]
    });

    let valid = 0;
    let invalid = 0;
    const issues = [];

    for (const mapping of mappings) {
      // Check if codes still exist and are active
      if (!mapping.namasteCodeDetails || mapping.namasteCodeDetails.status !== 'active') {
        invalid++;
        issues.push({
          mapping_id: mapping.id,
          issue: 'NAMASTE code not found or inactive',
          namaste_code: mapping.namaste_code
        });
        continue;
      }

      if (!mapping.icd11CodeDetails || mapping.icd11CodeDetails.status !== 'active') {
        invalid++;
        issues.push({
          mapping_id: mapping.id,
          issue: 'ICD-11 code not found or inactive',
          icd11_code: mapping.icd11_code
        });
        continue;
      }

      // Recalculate confidence score
      const recalculatedScore = helpers.calculateMappingConfidence(
        mapping.namasteCodeDetails.display_name,
        mapping.icd11CodeDetails.title
      );

      if (Math.abs(recalculatedScore - mapping.confidence_score) > 0.3) {
        issues.push({
          mapping_id: mapping.id,
          issue: 'Confidence score significantly different',
          current_score: mapping.confidence_score,
          calculated_score: recalculatedScore
        });
      }

      valid++;
    }

    console.log(`Validation complete: ${valid} valid, ${invalid} invalid mappings`);
    if (issues.length > 0) {
      console.log(`Found ${issues.length} issues:`);
      issues.slice(0, 10).forEach(issue => console.log(`- ${issue.issue} (Mapping ID: ${issue.mapping_id})`));
    }

    return { valid, invalid, issues };
  }

  // Reset statistics
  resetStats() {
    this.stats = {
      processed: 0,
      created: 0,
      skipped: 0,
      errors: 0
    };
  }

  // Print statistics
  printStats() {
    console.log('\n=== Mapping Creation Statistics ===');
    console.log(`Processed: ${this.stats.processed}`);
    console.log(`Created: ${this.stats.created}`);
    console.log(`Skipped: ${this.stats.skipped}`);
    console.log(`Errors: ${this.stats.errors}`);
    console.log(`Success Rate: ${((this.stats.created / this.stats.processed) * 100).toFixed(1)}%`);
    console.log('====================================\n');
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const creator = new MappingCreator();

  try {
    await sequelize.authenticate();
    console.log('Database connected successfully');

    switch (command) {
      case 'sample':
        await creator.createSampleMappings();
        break;

      case 'auto':
        const threshold = parseFloat(args[1]) || 0.7;
        await creator.createAutomaticMappings(threshold);
        break;

      case 'csv':
        const fs = require('fs');
        const csvFile = args[1];
        if (!csvFile || !fs.existsSync(csvFile)) {
          console.error('CSV file path required and must exist');
          process.exit(1);
        }
        const csvData = fs.readFileSync(csvFile, 'utf8');
        await creator.createMappingsFromCSV(csvData);
        break;

      case 'validate':
        await creator.validateMappings();
        break;

      case 'single':
        const [, namasteCode, icd11Code, mappingType, confidenceScore, notes] = args;
        if (!namasteCode || !icd11Code) {
          console.error('Usage: node create-mapping.js single <namaste_code> <icd11_code> [mapping_type] [confidence_score] [notes]');
          process.exit(1);
        }
        await creator.createMapping(namasteCode, icd11Code, mappingType, parseFloat(confidenceScore), notes);
        break;

      default:
        console.log('Available commands:');
        console.log('  sample                              - Create sample mappings');
        console.log('  auto [threshold]                    - Create automatic mappings (default threshold: 0.7)');
        console.log('  csv <file_path>                     - Create mappings from CSV file');
        console.log('  validate                            - Validate existing mappings');
        console.log('  single <namaste> <icd11> [type]     - Create single mapping');
        console.log('\nExample CSV format:');
        console.log('namaste_code,icd11_code,mapping_type,confidence_score,notes');
        console.log('NAM001,1435254666,equivalent,0.95,Direct mapping');
        break;
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Export for use as module
module.exports = { MappingCreator };

// Run if called directly
if (require.main === module) {
  main();
}

