const { schemas, validate, validateQuery } = require('../utils/validators');

module.exports = {
  // User validations
  validateCreateUser: validate(schemas.user.create),
  validateUpdateUser: validate(schemas.user.update),
  
  // NAMASTE code validations
  validateCreateNamesteCode: validate(schemas.namasteCode.create),
  
  // Code mapping validations
  validateCreateMapping: validate(schemas.codeMapping.create),
  
  // Search validations
  validateSearchQuery: validateQuery(schemas.search.query),
  
  // FHIR validations
  validateFhirBundle: validate(schemas.fhirBundle.create)
};
