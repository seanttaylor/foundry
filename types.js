/** 
 * @typedef {Object} MiddlewareOptions
 * @description Registry of Express middleware functions to inject into generated routes.
 * Middleware functions are executed in the order they are defined in the OpenAPI spec's
 * `x-middleware` extension or operation security requirements. Each function receives
 * access to the request/response objects and must call `next()` to continue processing.
 */ 

/**
 * @typedef {Object} SecurityImplementations
 * @description Registry of security scheme handlers that enforce authentication/authorization
 * based on OpenAPI `securitySchemes`. Each key matches a scheme name defined in the spec
 * (e.g., `simpleApiKey`, `partnerApiKey`), and its value is a factory function returning
 * Express middleware configured for that scheme.
 * 
 * @example
 * // For OpenAPI securitySchemes:
 * // components:
 * //   securitySchemes:
 * //     partnerApiKey: { type: 'apiKey', ... }
 * //     internalAuth: { type: 'oauth2', ... }
 * const options = {
 *   security: {
 *     partnerApiKey: () => (req, res, next) => { ... },
 *     internalAuth: () => (req, res, next) => { ... }
 *   }
 * };
 */

/**
 * @typedef {Function} SecurityHandlerFactory
 * @description Factory function that creates Express middleware for a specific security scheme.
 * The middleware receives scheme configuration and roles/scopes via `res.locals.auth`.
 * @returns {express.RequestHandler}
 */

/**
 * @typedef {Object.<string, SecurityHandlerFactory>} SecurityImplementations
 * @description Map of user-defined security scheme names (from OpenAPI `securitySchemes`)
 * to their corresponding handler factories.
 */

/**
 * @typedef {Object} FoundryOptions
 * @property {MiddlewareOptions} [middleware] - custom user-defined middleware to enhance generated routes
 * @property {SecurityImplementations} [security] - user-defined middleware to enforce specified OpenAPI security schemes (e.g. apikey, oauth2, etc.)
 */