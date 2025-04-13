import spec from '../generated/openapi.js';

const schemeHandlers = new Map();

/**
 * Finds a specific operation on a JSON-formatted OpenAPI specification
 * @param {String} operationId
 */
function findOperation(operationId) {
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (
        ['get', 'post', 'put', 'delete', 'patch'].includes(method) &&
        operation.operationId === operationId
      ) {
        return operation;
      }
    }
  }
  throw new Error(`Operation ${operationId} not found in spec`);
}

export const FoundryDefaultAuthProvider = {
  /**
   * @type {Map<string, {handler: Function, config: object}>}
   */
  schemeHandlers: new Map(),

  /**
   * @typedef SecurityImplementation
   * @property {Function} apiKey - Factory for apiKey security
   * @property {Function} oauth2 - Factory for oauth2 security
   */

  /**
   * Registers security scheme handlers
   * @param {SecurityImplementation} implementations
   */
  register(implementations) {
    Object.entries(implementations).forEach(([name, factory]) => {
      const config = spec.components?.securitySchemes?.[name];
      if (!config) throw new Error(`Unknown security scheme: ${name}`);

      // Validate factory matches scheme type
      if (config.type !== 'apiKey' && config.type !== 'oauth2') {
        throw new Error(`Unsupported scheme type: ${config.type}`);
      }

      this.schemeHandlers.set(name, {
        handler: factory(config), // Pre-bind config to handler
        config,
      });
    });
  },

  /**
   * @param {string} operationId
   * @returns {import('express').RequestHandler[]}
   */
  get(operationId) {
    const operation = findOperation(operationId);
    const securityRequirements = operation.security || spec.security;
    if (!securityRequirements) return [];

    return securityRequirements.flatMap((requirementGroup) => {
      return Object.entries(requirementGroup).map(
        ([schemeName, rolesOrScopes]) => {
          const scheme = this.schemeHandlers.get(schemeName);
          if (!scheme) throw new Error(`No handler for scheme: ${schemeName}`);

          return (req, res, next) => {
            res.locals.auth = {
              config: scheme.config,
              roles: scheme.config.type === 'apiKey' ? rolesOrScopes : [],
              scopes: scheme.config.type === 'oauth2' ? rolesOrScopes : [],
            };
            scheme.handler(req, res, next);
          };
        }
      );
    });
  },
};
