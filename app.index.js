import { FoundryServer } from './generated/server/index.js';

class NodeService {
  constructor() {}
}

/**
 * @typedef {Object} FoundryOptions
 * @property {MiddlewareOptions} [middleware] - Custom middleware to enhance generated routes
 */
const options = {
  NodeService: new NodeService(),
  middleware: {
    audit: (req, res, next) => {
      console.log(`Audting... ${req.path}`);
      next();
    },
  },
  security: {
    simpleApiKey: () => (req, res, next) => {
      const { config, roles } = res.locals.auth;
      const key = req.headers[config.name];

      if (!key) {
        res.set('content-type', 'application/problem+json');
        res.status(401);
        res.send({
          type: '/probs/authorization-error',
          title: 'The request could not be authorized',
          status: 401,
          detail: 'Access could not be granted to protected resource. Ensure valid authorization credentials are provided in the request. See API specification.',
          instance: req.path
        });
        return;
      } 
      // TODO: Create role validation logic
      /*
        if (roles.length > 0 && !validateRoles(key, roles)) {
          res.set('content-type', 'application/problem+json');
          res.status(403);
          res.send({
            type: '/probs/authorization-error',
            title: 'The request could not be authorized',
            status: 403,
            detail: 'Access could not be granted to protected resource. The provided authorization credential does not have the required access grants. See administrator.',
          });
          return;
        }
      */
   
      next();
    },
  },
};

try {
  const server = new FoundryServer(options);
  server.start();
} catch (ex) {
  console.error(
    `INTERNAL_ERROR (App): Could not start server. See details -> ${ex.message}`
  );
}
