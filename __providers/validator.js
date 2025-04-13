import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv); // For email/date/etc validation

const validationRegistry = new Map();

export const FoundryDefaultValidationProvider = {
  /**
   * Registers validation config for an operation
   * @param {string} operationId - Unique operation identifier
   * @param {Object} config - Validation rules
   * @param {Object} config.path - Path params schema
   * @param {Object} config.query - Query params schema
   * @param {Object} config.headers - Headers schema
   * @param {Object} config.body - Request body schema
   * @param {boolean} config.security - Whether auth is required
   */
  register(operationId, config) {
    try {
      // Pre-compile schemas for performance
      validationRegistry.set(operationId, {
        path: config.path && ajv.compile(config.path),
        query: config.query && ajv.compile(config.query),
        headers: config.headers && ajv.compile(config.headers),
        body: config.body && ajv.compile(config.body),
      });
    } catch (ex) {
      console.error(
        `INTERNAL_ERROR (Foundry.ValidationProvider): Exception encountered while registering validation configuration on (${operationId}). See details -> ${ex.message}`
      );
    }
  },

  /**
   * Gets validation middleware for an operation
   * @param {string} operationId
   * @returns {import('express').RequestHandler}
   */
  get(operationId) {
    const config = validationRegistry.get(operationId);

    return (req, res, next) => {
      try {
        if (!config) {
          // No request configuration to validate; proceed to next middleware
          return next();
        }

        // 1. Validate request
        const errors = [];
        if (config.path && !config.path(req.params)) {
          errors.push(...formatErrors('path', config.path.errors));
        }
        if (config.query && !config.query(req.query)) {
          errors.push(...formatErrors('query', config.query.errors));
        }
        if (config.headers && !config.headers(req.headers)) {
          errors.push(...formatErrors('header', config.headers.errors));
        }
        if (config.body && !config.body(req.body)) {
          errors.push(...formatErrors('body', config.body.errors));
        }

        if (errors.length) {
          return res.status(400).json({
            error: 'ValidationError',
            operationId,
            details: errors,
          });
        }

        next();
      } catch (ex) {
        console.error(
          `INTERNAL_ERROR (Foundry.ValidationProvider): Exception encountered while validating request. See details -> ${ex.message}`
        );
        next(ex);
      }
    };
  },
};

// Helper to standardize error format
function formatErrors(location, ajvErrors = []) {
  return ajvErrors.map((error) => ({
    location,
    path: error.instancePath,
    message: error.message,
    code: error.keyword,
  }));
}
