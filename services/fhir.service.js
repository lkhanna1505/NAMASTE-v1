const { NamesteCode, ICD11Code, CodeMapping } = require('../models');

class FhirService {
  generateCapabilityStatement() {
    return {
      resourceType: "CapabilityStatement",
      id: "namaste-icd11-api",
      url: "http://terminology.hl7.org/CapabilityStatement/namaste-icd11-api",
      version: "1.0.0",
      name: "NAMASTE_ICD11_API",
      title: "NAMASTE to ICD-11 Terminology Server",
      status: "active",
      date: new Date().toISOString().split('T')[0],
      publisher: "Healthcare API Team",
      description: "FHIR R4 Terminology Server for NAMASTE to ICD-11 code mapping",
      kind: "instance",
      implementation: {
        description: "NAMASTE-ICD11 API Server",
        url: process.env.API_BASE_URL || "http://localhost:3000"
      },
      fhirVersion: "4.0.1",
      format: ["json"],
      rest: [{
        mode: "server",
        resource: [
          {
            type: "CodeSystem",
            interaction: [
              { code: "read" },
              { code: "search-type" }
            ],
            searchParam: [
              {
                name: "url",
                type: "uri"
              },
              {
                name: "version",
                type: "token"
              }
            ]
          },
          {
            type: "ConceptMap",
            interaction: [
              { code: "read" },
              { code: "search-type" }
            ]
          }
        ],
        operation: [
          {
            name: "translate",
            definition: "http://hl7.org/fhir/OperationDefinition/ConceptMap-translate"
          }
        ]
      }]
    };
  }

  async generateNamesteCodeSystem(systemType = null) {
    const whereClause = systemType ? { system_type: systemType, status: 'active' } : { status: 'active' };
    const codes = await NamesteCode.findAll({ where: whereClause });

    return {
      resourceType: "CodeSystem",
      id: `namaste-${systemType || 'all'}`,
      url: `http://terminology.hl7.org/CodeSystem/namaste-${systemType || 'all'}`,
      version: "1.0.0",
      name: `NAMASTE_${systemType ? systemType.toUpperCase() : 'ALL'}`,
      title: `NAMASTE ${systemType ? systemType : 'All Systems'} Terminology`,
      status: "active",
      date: new Date().toISOString().split('T')[0],
      publisher: "Ministry of AYUSH, Government of India",
      description: `Standardized terminology for ${systemType || 'traditional medicine'} disorders and conditions`,
      caseSensitive: true,
      content: "complete",
      count: codes.length,
      concept: codes.map(code => ({
        code: code.code,
        display: code.display_name,
        definition: code.definition,
        property: [
          {
            code: "system",
            valueString: code.system_type
          },
          {
            code: "category", 
            valueString: code.category
          }
        ]
      }))
    };
  }

  async generateICD11CodeSystem(module = 'tm2') {
    const codes = await ICD11Code.findAll({ 
      where: { module, status: 'active' },
      limit: 1000 // Limit for performance
    });

    return {
      resourceType: "CodeSystem",
      id: `icd11-${module}`,
      url: `http://id.who.int/icd/release/11/2023-01/${module}`,
      version: "2023-01",
      name: `ICD11_${module.toUpperCase()}`,
      title: `ICD-11 ${module.toUpperCase()} Module`,
      status: "active",
      date: new Date().toISOString().split('T')[0],
      publisher: "World Health Organization",
      description: `ICD-11 ${module.toUpperCase()} terminology`,
      caseSensitive: true,
      content: "fragment",
      count: codes.length,
      concept: codes.map(code => ({
        code: code.icd_id,
        display: code.title,
        definition: code.definition
      }))
    };
  }

  async generateConceptMap() {
    const mappings = await CodeMapping.findAll({
      where: { is_active: true },
      include: [
        { association: 'namasteCodeDetails' },
        { association: 'icd11CodeDetails' }
      ],
      limit: 1000
    });

    const groups = {};
    
    mappings.forEach(mapping => {
      const sourceSystem = `namaste-${mapping.namasteCodeDetails.system_type}`;
      
      if (!groups[sourceSystem]) {
        groups[sourceSystem] = {
          source: `http://terminology.hl7.org/CodeSystem/${sourceSystem}`,
          target: "http://id.who.int/icd/entity",
          element: []
        };
      }

      groups[sourceSystem].element.push({
        code: mapping.namaste_code,
        display: mapping.namasteCodeDetails.display_name,
        target: [{
          code: mapping.icd11_code,
          display: mapping.icd11CodeDetails.title,
          equivalence: mapping.mapping_type,
          comment: mapping.notes
        }]
      });
    });

    return {
      resourceType: "ConceptMap",
      id: "namaste-to-icd11",
      url: "http://terminology.hl7.org/ConceptMap/namaste-to-icd11",
      version: "1.0.0",
      name: "NAMASTE_to_ICD11",
      title: "NAMASTE to ICD-11 Concept Map",
      status: "active",
      date: new Date().toISOString().split('T')[0],
      publisher: "Healthcare API Team",
      sourceUri: "http://terminology.hl7.org/CodeSystem/namaste-all",
      targetUri: "http://id.who.int/icd/entity",
      group: Object.values(groups)
    };
  }

  async translateCode(system, code, targetSystem) {
    let sourceCode, targetCode;

    if (system.includes('namaste')) {
      sourceCode = await NamesteCode.findOne({ where: { code, status: 'active' } });
      if (!sourceCode) {
        throw new Error('Source code not found');
      }

      const mappings = await CodeMapping.findAll({
        where: { namaste_code: code, is_active: true },
        include: [{ association: 'icd11CodeDetails' }]
      });

      return mappings.map(mapping => ({
        equivalence: mapping.mapping_type,
        concept: {
          system: 'http://id.who.int/icd/entity',
          code: mapping.icd11_code,
          display: mapping.icd11CodeDetails.title
        }
      }));

    } else if (system.includes('icd')) {
      targetCode = await ICD11Code.findOne({ where: { icd_id: code, status: 'active' } });
      if (!targetCode) {
        throw new Error('Source code not found');
      }

      const mappings = await CodeMapping.findAll({
        where: { icd11_code: code, is_active: true },
        include: [{ association: 'namasteCodeDetails' }]
      });

      return mappings.map(mapping => ({
        equivalence: mapping.mapping_type,
        concept: {
          system: `http://terminology.hl7.org/CodeSystem/namaste-${mapping.namasteCodeDetails.system_type}`,
          code: mapping.namaste_code,
          display: mapping.namasteCodeDetails.display_name
        }
      }));
    }

    throw new Error('Unsupported code system');
  }
}

module.exports = new FhirService();
