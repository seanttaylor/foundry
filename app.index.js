import { FoundryServer } from './generated/server/index.js';

class NodeService {
  constructor() {}
}

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
      console.log('validating simpleApiKey...');
      const { config, roles } = res.locals.auth;
      const key = req.headers[config.name];

      if (!key) return res.status(401).send('Missing API key');
      // if (roles.length > 0 && !validateRoles(key, roles)) {
      //   return res.status(403).send('Forbidden');
      // }
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
