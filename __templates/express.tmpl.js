/**
 * Generates an Express server template
 * @param {Object} options
 * @param {String} options.routeMounts - template literal containing all Express server mount points
 * @param {String} roptions.outeImports - template literal containing all import statements for Express router objects
 * @returns 
 */
export const getTemplate = ({ routeMounts, routeImports }) => `// AUTO-GENERATED BY FOUNDRY
import express from 'express';
import bodyParser from 'body-parser';
import morgan from 'morgan';
${routeImports}

export class FoundryServer {
  #HAS_EXCEPTION = false;
  #app;
  #port;

  /**
   * @param {Object} options - configuration object containing named application
   * services defined in the source OpenAPI specfication
   */ 
  constructor(options = {}) {
    try {
      this.#app = express();
      this.#port = options.port || 3000;
    
      // Application-level middleware
      this.#app.use(morgan('tiny'));
      this.#app.use(express.json());
      this.#app.use(bodyParser.urlencoded({ extended: false }));

      // Mount routes
      ${routeMounts}

      this.#app.use((err, req, res, next) => {
        const status = 404;
        res.status(status).send({ 
          type: '/probs/not-found',
          title: 'The requested resource cannot be found.',
          status: 404,
          detail: 'The request cannot be completed be cause the requested resource cannot be found. Ensure the resource exists.',
          instance: req.path
        });
      });

      this.#app.use((err, req, res, next) => {
        const status = 500;
        const error = err.error || err.message;
        
        console.error(\`INTERNAL_ERROR (HTTPService): Exception encountered on route (\${req.path}). See details -> \${error}\`);
        res.status(status).send({ 
          type: '/probs/internal-error',
          title: 'There was an error',
          status: 500,
          detail: 'The request cannot be completed due to a server-side exception. Please try again later.',
          instance: req.path
        });
      });

    } catch(ex) {
      console.error(
        \`INTERNAL_ERROR (FoundryServer): Could not initialize the server. See details -> \${ex.message}\`
      );
      this.#HAS_EXCEPTION = true;
    }
   
  }

  start() {
    if (!this.#HAS_EXCEPTION) {
      return this.#app.listen(this.#port, () => {
        console.log(\`Server running on port \${this.#port}\`);
      });
    }
  }
}
`;