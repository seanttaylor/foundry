import {
    confirm,
    intro,
    log,
    select,
    spinner,
    tasks,
    text,
  } from '@clack/prompts';
  
  import { program, Option } from 'commander';
  import fs from 'fs';
  import YAML from 'yaml';
  import path from 'path';
  
  const Config = {
    version: '0.0.1',
  };
  
  const commands = {
    build: {
      name: 'build',
      description:
        'Launches an interactive prompt for generating code from a provided OpenAPI specification',
    },
    default: {
      name: 'default',
      options: {
        output: {
          flag: ['-o, --output <dir>', 'Output directory', './generated'],
        },
        path: {
          flag: [
            '-p, --path <file>',
            'Path to a valid OpenAPI specification file (.yaml or .json)',
          ],
        },
        lang: {
          flag: [
            '-l, --lang <string>',
            'Programming language of the generated service',
            'JavaScript',
          ],
          choices: ['Go', 'JavaScript', 'Kotlin', 'Python', 'TypeScript'],
        },
        autostart: {
          flag: [
            '-a, --autostart <boolean>',
            'Indicates whether the generated service should be started automatically on build completion',
          ],
        },
      },
    },
  };
  
  const prompts = {
    path: {
      message: 'Enter the file path of your OpenAPI spec file',
      placeholder: './api-spec.yaml',
      //initialValue: '42',
      validate(value) {
        // check file path is valid
        if (value.length === 0) return `Value must be a valid file path`;
      },
    },
    ouput: {
      message: 'Enter the output directory for the generated code',
      placeholder: './my-output-directory',
      initialValue: './generated',
      validate(value) {
        // check file path is valid
        if (value.length === 0) return `Value must be a valid file path`;
      },
    },
    lang: {
      message: 'Select the programming language of the generated service',
      options: [
        { value: 'go', label: 'Go' },
        { value: 'javascript', label: 'JavaScript' },
        { value: 'kotlin', label: 'Kotlin' },
        { value: 'python', label: 'Python' },
        { value: 'typescript', label: 'TypeScript' },
      ],
    },
    zipOutput: {
      message: 'Should the generated service be compressed as a zip file?',
    },
    autostart: {
      message: 'Should the service start once build completes?',
    },
  };
  
  /**
   * Houses current application state for a single generation of an API spec
   */
  const workflow = {};
  
  const toCamelCase = (str) =>
    str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  
  const toPascalCase = (str) => str.charAt(0).toUpperCase() + str.slice(1);
  
  /**
   * @param {String} filePath - path to the OpenAPI specification
   * @param {String} outputDir - path to the output directory for any generated files
   * @returns {void}
   */
  async function onParseAPISpec(filePath, outputDir) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const json = filePath.endsWith('.yaml')
        ? YAML.parse(content)
        : JSON.parse(content);
  
      // Ensure output directory exists
      fs.mkdirSync(outputDir, { recursive: true });
  
      // Generate openapi.js
      const specOutput = `/******** NOTICE: FOUNDRY AUTO-GENERATED FROM ${path.basename(
        filePath
      )} ********/
  export default ${JSON.stringify(json, null, 2)};`;
  
      fs.writeFileSync(path.join(outputDir, 'openapi.js'), specOutput);
  
      workflow.outputDir = outputDir;
      workflow.spec = json;
    } catch (ex) {
      console.error(
        `INTERNAL_ERROR: Exception encountered while parsing API specification. See details -> ${ex.message}`
      );
      terminate();
    }
  }
  
  /**
   * Defines API routes from the OpenAPI spec file
   * @returns {void}
   */
  async function onScaffoldEndpoints() {
    try {
      const routes = generateRoutes(workflow.spec);
      generateRouteFiles(routes);
    } catch (ex) {
      console.error(
        `INTERNAL_ERROR: Exception encountered while scaffolding API endpoints. See details -> ${ex.message}`
      );
      terminate();
    }
  }
  
  /**
   * @param {Object[]} routes - all routes extracted from the OpenAPI specification
   * @param {String} outputDir
   *
   */
  function generateRouteFiles(routes, outputDir = './generated/routes') {
    // 1. Ensure routes directory exists
    fs.mkdirSync(outputDir, { recursive: true });
  
    // 2. Group routes by base path
    const routeGroups = {};
    routes.forEach((route) => {
      const basePath = route.path.split('/')[1]; // 'widgets' from '/widgets/{id}'
      routeGroups[basePath] = routeGroups[basePath] || [];
      routeGroups[basePath].push(route);
    });
  
    // 3. Generate one file per resource
    Object.entries(routeGroups).forEach(([resource, routes]) => {
      const routeContent = generateRouteTemplate(resource, routes);
      const filePath = path.join(outputDir, `${resource}.js`);
      fs.writeFileSync(filePath, routeContent);
    });
  }
  
  /**
   * Extracts example definitions from the OpenAPI specification
   * @param {String} method
   * @returns {Object}
   */
  function getResponseExample(method) {
    // 1. Only check successful responses (200/201)
    const successResponse =
      method.responses?.['200'] || method.responses?.['201'];
    if (!successResponse) return null;
  
    // 2. Only check application/json
    const content = successResponse.content?.['application/json'];
    if (!content) return null;
  
    // 3. Check for multiple examples (OpenAPI 3.0 style)
    if (content.examples) {
      const firstExampleKey = Object.keys(content.examples)[0];
      return content.examples[firstExampleKey]?.value;
    }
  
    // 4. Check for single example (OpenAPI 3.1 style)
    if (content.example) {
      return content.example;
    }
  
    // 5. No examples found → return null (will trigger 204)
    return null;
  }
  
  /**
   * @param {String} resource - fallback service name (e.g., "widget")
   * @param {Object[]} routes
   * @returns {String}
   */
  function generateRouteTemplate(resource, routes) {
    // 1. Register validation configs
    const validationRegistrations = routes
      .flatMap((route) =>
        route.methods.map((method) => {
          const config = buildValidationConfig(method);
          return `FoundryDefaultValidationProvider.register('${
            method.operationId
          }', ${JSON.stringify(config, null, 2)});`;
        })
      )
      .join('\n');
  
    // 2. Generate route stubs
    const routeStubs = routes
      .map((route) => {
        const expressPath = route.path.replace(/\{([^}]+)\}/g, ':$1');
        return route.methods
          .map((method) => {
            const example = getResponseExample(method);
            const serviceName =
              method.xService?.name ||
              route.xService?.name ||
              `${resource}Service`;
            const middlewareStack = buildMiddlewareStack(method, route);
  
            return `
  router.${method.method}('${expressPath}', [
    ...FoundryDefaultAuthProvider.get('${method.operationId}'),
    FoundryDefaultValidationProvider.get('${method.operationId}'),
    ...validateMiddlewareStack(${middlewareStack})
  ], (req, res) => {
    // Implement in options.${serviceName}.${method.operationId}
    ${
      example
        ? `res.json(${JSON.stringify(example, null, 2)});`
        : 'res.sendStatus(204);'
    }
  });`;
          })
          .join('\n\n');
      })
      .join('\n\n');
  
    return `// AUTO-GENERATED BY FOUNDRY
  import express from 'express';
  import {
    FoundryDefaultValidationProvider,
    FoundryDefaultAuthProvider
  } from '../../__providers/index.js';
  
  ${validationRegistrations}
  
  export class ${toPascalCase(resource)}Router {
    #options;
  
    constructor(options) {
      this.#options = options;
      
      // Register security implementations if provided
      if (options.security) {
        FoundryDefaultAuthProvider.register(options.security);
      }
  
      const router = express.Router();
      const validateMiddlewareStack = (stack) => stack.filter(Boolean);
  
      ${routeStubs}
      return router;
    }
  }`;
  }
  
  /**
   * Creates a list of route metadata for all routes in the API specification
   * @param {Object} spec - spec file in JSON object form
   * @returns {Object[]}
   */
  function generateRoutes(spec) {
    const routes = [];
  
    // Iterate through each path (e.g., '/widgets', '/widgets/{id}')
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      const route = {
        path,
        xService: pathItem['x-service'],
        xMiddleware: ensureArray(pathItem['x-middleware']), // Safe array conversion
        methods: [],
      };
  
      // Iterate through each HTTP method (get, post, etc.)
      for (const [method, operation] of Object.entries(pathItem)) {
        if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
          route.methods.push({
            method,
            operationId: operation.operationId,
            parameters: operation.parameters || [],
            requestBody: operation.requestBody,
            responses: operation.responses,
            xService: operation['x-service'] || pathItem['x-service'],
            xMiddleware: ensureArray(operation['x-middleware']), // Safe array conversion
          });
        }
      }
  
      routes.push(route);
    }
  
    return routes;
  }
  
  /**
   * Generates package.json in the output directory
   * @param {Object} spec - Parsed OpenAPI specification
   * @param {String} outputDir - Path to output directory
   */
  function onGeneratePackageJson(outputDir = './generated') {
    const { spec } = workflow;
    try {
      const pkg = {
        name: spec.info.title.replace(/\s+/g, '-').toLowerCase(),
        version: spec.info.version || '0.0.1',
        description: spec.info.summary || '',
        type: 'module',
        main: 'app.js',
        dependencies: {
          ajv: '^8.17.1',
          'ajv-formats': '^3.0.1',
          'body-parser': '^2.2.0',
          express: '^4.18.2',
          morgan: '^1.10.0',
          // Will add other core dependencies later
        },
        scripts: {
          start: 'npm install & node app.js',
        },
      };
  
      fs.writeFileSync(
        path.join(outputDir, 'package.json'),
        JSON.stringify(pkg, null, 2)
      );
    } catch (ex) {
      console.error(
        `INTERNAL_ERROR (Main): Exception encountered while generating package.json file. See details -> ${ex.message}`
      );
      terminate();
    }
  }
  
  /**
   * Creates skeleton server; includes imports to application services
   */
  async function onGenerateServerTemplate() {
    try {
      const serverDir = path.join(workflow.outputDir, 'server');
      const routesDir = path.join(workflow.outputDir, 'routes');
  
      // 1. Ensure directories exist
      fs.mkdirSync(serverDir, { recursive: true });
  
      // 2. Dynamically import all route files
      const routeFiles = fs
        .readdirSync(routesDir)
        .filter((file) => file.endsWith('.js'))
        .map((file) => path.basename(file, '.js'));
  
      const routeImports = routeFiles
        .map(
          (file) =>
            `import { ${toPascalCase(file)}Router } from '../routes/${file}.js';`
        )
        .join('\n');
  
      const routeMounts = routeFiles
        .map((file) => `this.#app.use(new ${toPascalCase(file)}Router(options));`)
        .join('\n    ');
  
      // 3. Generate server template with dynamic routes
      const serverContent = `// AUTO-GENERATED BY FOUNDRY
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
            count: 0,
            items: [], 
            error: 'NOT_FOUND' 
          });
        });
  
        this.#app.use((err, req, res, next) => {
          const status = 500;
          const error = err.error || err.message;
          
          console.error(\`INTERNAL_ERROR (HTTPService): Exception encountered on route (\${req.path}). See details -> \${error}\`);
          res.status(status).send({ 
            count: 0,
            items: [], 
            error:'INTERNAL_ERROR' 
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
  
      // 4. Write server file
      fs.writeFileSync(path.join(serverDir, 'index.js'), serverContent);
    } catch (ex) {
      console.error(
        `INTERNAL_ERROR: Failed to setup application services -> ${ex.message}`
      );
      terminate();
    }
  }
  
  /**
   * Builds JSON Schema specifications from the `Models` object in an OpenAPI spec file
   * @returns {void}
   */
  async function onBuildModels() {}
  
  /**
   * Fires after the `foundry build` command is run; starts
   * the interactive prompt
   * @returns {void}
   */
  async function onInteractiveBuild() {
    intro(`Starting in interactive mode...`);
  
    const specPath = await text(prompts.path);
    const outputDir = await text(prompts.ouput);
    const language = await select(prompts.lang);
    const autostart = await confirm(prompts.autostart);
  
    // const s = spinner();
    // s.start('Installing via npm');
  
    await tasks([
      {
        title: `Parsing OpenAPI Spec (${specPath})`,
        task: onParseAPISpec.bind(null, specPath, outputDir),
      },
      {
        title: `Creating package.json...`,
        task: onGeneratePackageJson.bind(null, outputDir),
      },
      {
        title: `Scaffolding REST API Endpoints`,
        task: onScaffoldEndpoints,
      },
      {
        title: `Generating server template...`,
        task: onGenerateServerTemplate.bind(null, outputDir),
      },
      {
        title: `Exporting to output directory`,
        task: async (message) => {
          // const s = spinner();
          // s.start('Building Models...');
          return;
        },
      },
    ]);
  
    log.success(
      `Foundry build (${workflow.spec.info.title}) completed in (42) seconds.`
    );
  }
  
  /**
   * Fires after the `foundry` command is run with minimum required arguments; generates
   * code with defaults
   * @param {Object} options
   * @returns {void}
   *
   */
  function onAutomatedBuild(options) {
    console.log(`Generating server from ${options.path}...`);
    console.log(options);
    // Generation logic will go here
  }
  
  /******** FOUNDRY UTILITIES ********/
  
  /**
   * Ends the terminal session
   * @returns {void}
   */
  function terminate() {
    log.error(
      'Foundry build TERMINATED due to exception. Check above for details.'
    );
    process.exit(0);
  }
  
  /**
   * Helper to ensure consistent array format
   * @param {String | String[] } value
   */
  function ensureArray(value) {
    if (Array.isArray(value)) return value;
    if (value) return [value];
    return [];
  }
  
  /**
   * Converts OpenAPI operation parameters to validation config
   * @param {Object} operation - OpenAPI operation object
   * @returns {Object} Validation config for FoundryDefaultValidationProvider
   */
  function buildValidationConfig(operation) {
    const config = {
      path: { type: 'object', properties: {}, required: [] },
      query: { type: 'object', properties: {}, required: [] },
      headers: { type: 'object', properties: {}, required: [] },
      body: null,
    };
  
    // Process parameters (path/query/header)
    (operation.parameters || []).forEach((param) => {
      const schema = param.schema || { type: 'string' };
  
      switch (param.in) {
        case 'path':
          config.path.properties[param.name] = schema;
          if (param.required) config.path.required.push(param.name);
          break;
        case 'query':
          config.query.properties[param.name] = schema;
          if (param.required) config.query.required.push(param.name);
          break;
        case 'header':
          config.headers.properties[param.name.toLowerCase()] = schema;
          if (param.required)
            config.headers.required.push(param.name.toLowerCase());
          break;
      }
    });
  
    // Process request body
    if (operation.requestBody) {
      config.body =
        operation.requestBody.content?.['application/json']?.schema || null;
    }
  
    return config;
  }
  
  /**
   * Collects all unique services and middlewares with descriptions
   * @param {Object[]} routes - Processed route definitions
   * @returns {Array<{path: string, description: string}>} - JSDoc entries
   */
  function collectDependencies(routes) {
    const dependencies = new Map(); // Using Map to avoid duplicates
  
    routes.forEach((route) => {
      // 1. Process path-level x-service
      if (route.xService?.name && route.xService?.description) {
        dependencies.set(`options.${route.xService.name}`, {
          path: `options.${route.xService.name}`,
          description: route.xService.description,
        });
      }
  
      // 2. Process path-level x-middleware
      (route.xMiddleware || []).forEach((mw) => {
        if (mw.name && mw.description) {
          dependencies.set(`options.middleware.${mw.name}`, {
            path: `options.middleware.${mw.name}`,
            description: mw.description,
          });
        }
      });
  
      // 3. Process operation-level x-middleware
      route.methods.forEach((method) => {
        (method.xMiddleware || []).forEach((mw) => {
          if (mw.name && mw.description) {
            dependencies.set(`options.middleware.${mw.name}`, {
              path: `options.middleware.${mw.name}`,
              description: mw.description,
            });
          }
        });
      });
    });
  
    return Array.from(dependencies.values());
  }
  
  /**
   * Creates user-defined middleware stack
   * @param {Object} method
   * @param {Object} route
   * @returns {String}
   */
  function buildMiddlewareStack(method, route) {
    // Combine path-level and operation-level middleware
    return (
      '[' +
      [...route.xMiddleware, ...method.xMiddleware]
        .map((m) => `this.#options.middleware?.${m.name}`)
        .join(', ') +
      ']'
    );
  }
  
  /******** APPLICATION ********/
  (function main() {
    try {
      /******** INTERACTIVE PATH ********/
      const IN_INTERACTIVE_MODE = process.argv[2] === 'build';
  
      if (IN_INTERACTIVE_MODE) {
        program
          .version(Config.version)
          .command(commands.build.name)
          .description(commands.build.description)
          .action(onInteractiveBuild);
  
        program.parse();
        return;
      }
  
      /******** AUTOMATED DEFAULT PATH ********/
      program
        .requiredOption(...commands.default.options.path.flag)
        .addOption(
          new Option(...commands.default.options.lang.flag).choices(
            commands.default.options.lang.choices
          )
        )
        .option(...commands.default.options.output.flag)
        .action(onAutomatedBuild);
    } catch (ex) {
      console.error(
        `INTERNAL_ERROR (Main): Encountered an exception during build run. See details --> ${ex.message}`
      );
    }
  })();
  