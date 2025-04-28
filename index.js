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


  /******** TEMPLATES ********/
  import { BaseModelTmpl } from './__templates/base-model.tmpl.js';
  import { SQLiteInitTmpl } from './__templates/sqlite-init.tmpl.js';
  import { ModelTmpl } from './__templates/model.tmpl.js';

  const Config = {
    version: '0.0.1',
    datasources: {
      sqlite: SQLiteInitTmpl,
    }
  };
  
  const commands = {
    build: {
      name: 'build',
      description:
        'Launches an interactive prompt for generating code from a provided OpenAPI specification',
    },
    bedrock: {
      name: 'bedrock',
      description: 'Generates SQL schemas in a specified dialect for all data types defined in the `components` section of an OpenAPI spec file'
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
    bedrock_build: {
      name: 'bedrock',
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
        sql: {
          flag: [
            '-s, --sql <string>',
            'Dialect of the generated SQL tables',
            'SQLite',
          ],
          choices: ['sqlite', 'postgres', 'mysql', 'mongodb' ],
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
    sql: {
      message: 'In which SQL dialect should components schemas in the spec file be generated?',
      options: [
        { value: 'sqlite', label: 'SQLite' },
        { value: 'postgres', label: 'Postgres' },
        { value: 'mysql', label: 'MySQL' },
        { value: 'mongo', label: 'MonogDB' },
        { value: 'none', label: 'None. Do not generate SQL schemas' },
      ],
    }
  };

  const SQL_TYPE_MAP = {
    string: {
      sqlite: (format) => {
        switch(format) {
          case 'date-time': return 'TEXT'; // ISO8601 strings
          case 'date': return 'TEXT';      // YYYY-MM-DD
          case 'time': return 'TEXT';      // HH:MM:SS
          case 'uuid': return 'TEXT';      // UUIDs as text
          case 'email': return 'TEXT';     // With separate CHECK constraint
          default: return 'TEXT';
        }
      },
      postgres: (format) => {
        switch(format) {
          case 'date-time': return 'TIMESTAMP';
          case 'date': return 'DATE';
          case 'time': return 'TIME';
          case 'uuid': return 'UUID';
          case 'email': return 'TEXT'; // Postgres doesn't have email type
          default: return 'TEXT';
        }
      }
    },
    number: {
      sqlite: () => 'REAL',  // SQLite doesn't distinguish float/integer
      postgres: (format) => format === 'integer' ? 'INTEGER' : 'NUMERIC'
    },
    integer: {
      sqlite: () => 'INTEGER',
      postgres: () => 'INTEGER'
    },
    boolean: {
      sqlite: () => 'INTEGER(1)',  // 0/1 storage
      postgres: () => 'BOOLEAN'
    },
    array: {
      sqlite: () => 'TEXT',  // JSON-serialized
      postgres: () => 'JSONB'
    },
    object: {
      sqlite: () => 'TEXT',  // JSON-serialized
      postgres: () => 'JSONB'
    }
  };
  
  /**
   * Houses current application state for a single generation of an API spec
   */
  const workflow = {};
  
  const toCamelCase = (str) =>
    str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  
  const toPascalCase = (str) => str.charAt(0).toUpperCase() + str.slice(1);

  function toSnakeCase(str) {
    return str
      .replace(/([a-z])([A-Z])/g, '$1_$2')  // camelCase to camel_case
      .replace(/\s+/g, '_')                  // spaces to underscores
      .toLowerCase();                         // enforce lowercase
  }
    
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
   * Defines API routes from the OpenAPI specification file
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
   * Creates Express route files from a template
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
   * Outputs the Express route definitions as a template literal
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
   * @param {Object} spec - specifciation file in JSON form
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
   * Generates a package.json file in the output directory
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
          ajv: "^8.17.1",
          "ajv-formats": "^3.0.1",
          "better-sqlite3": "^11.9.1",
          "body-parser": "^2.2.0",
          express: "^4.18.2",
          morgan: "^1.10.0",
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
   * Creates skeleton Express server
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
   * Builds SQL tables based on specific data types defined on the `components` property in the spec file
   * @param {Object} options
   * @param {String} options.datasource - indicates the type of persistence desired e.g json, sqlite, postgres)
   * @param {String} options.sql - indicates which SQL dialect to prepare database tables in
   * @param {String} options.path - path of the OpenAPI specification or JSON Schema file
   * @param {String} options.output - directory to save SQL schemas

   * @returns {void}
   */
  async function onBuildModels(options) {
    try {
       // 1. Load or reuse the spec
      if (!workflow.spec) {
        const content = fs.readFileSync(options.path, 'utf8');
        workflow.spec = options.path.endsWith('.yaml') 
          ? YAML.parse(content) 
          : JSON.parse(content);
        
        if (!workflow.spec?.components?.schemas) {
          throw new Error('No `components.schemas` found in specification');
        }

      }

      // 2. Prepare output directories
      const outputDir = path.join(options.output, 'db');
      fs.mkdirSync(outputDir, { recursive: true });
      fs.mkdirSync(path.join(outputDir, 'migrations'), { recursive: true });
      
      const modelDir = path.join(options.output, 'models');
      fs.mkdirSync(modelDir, { recursive: true });

      // 3. Generate SQL schema
      const { schemaSQL, migrations } = generateSQLSchema({
        schemas: workflow.spec.components.schemas,
        dialect: options.sql
      });

      // 4. Create Models 
      Object.entries(workflow.spec.components.schemas).forEach(([name, schema]) => {

        const className = toPascalCase(name);
        const tableName = toSnakeCase(name);
    
        // Generate property accessors with JSDoc
        const accessors = Object.entries(schema.properties || {})
          .map(([prop, def]) => {
            const typeMap = {
              string: 'string',
              number: 'number',
              integer: 'number',
              boolean: 'boolean',
              array: 'Array',
              object: 'Object'
            };
            
            const jsType = typeMap[def.type] || def.type || 'any';
            const description = def.description ? ` - ${def.description}` : '';
    
            return `
    /**
     * @type {${jsType}}${description}
     */
    get ${prop}() {
      return this.__data.${prop};
    }

    set ${prop}(value) {
      this.__data.${prop} = value;
    }`;
          })
          .join('\n');
    
        const modelTemplate = ModelTmpl.getTemplate({ className, tableName, accessors});
    
        fs.writeFileSync(path.join(modelDir, `${className}.js`), modelTemplate);
      });

      // 5. Write output files
      const templateFactory = Config.datasources[options.sql];
      fs.writeFileSync(path.join(outputDir, 'schema.sql'), schemaSQL);
      
      if (migrations.length > 0) {
        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
        migrations.forEach((migration, i) => {
          const migrationName = `${timestamp}_${String(i).padStart(2, '0')}_${migration.name}.sql`;
          fs.writeFileSync(path.join(outputDir, 'migrations', migrationName), migration.sql);
        });
      }

      fs.writeFileSync(path.join(outputDir, 'init.js'), templateFactory.getTemplate({ datasource: options.sql }));
      fs.writeFileSync(path.join(modelDir, 'BaseModel.js'), BaseModelTmpl.getTemplate({ datasource: options.sql }));

      log.success(`Generated SQL schema (${options.sql}) in ${outputDir}`);

    } catch(ex) {
      console.error(`INTERNAL_ERROR (Foundry.Bedrock): Encountered exception while building SQL tables. See details -> ${ex.message}`);
    }
  }
  
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
    const buildSQL = await select(prompts.sql); 
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
        title: `Validating SQL Configuration...`,
        task: onBuildModels.bind(null, { sql: buildSQL, output: outputDir }),
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
   * @returns {Array}
   */
  function ensureArray(value) {
    if (Array.isArray(value)) return value;
    if (value) return [value];
    return [];
  }
  
  /**
   * Converts OpenAPI operation parameters to validation configs
   * @param {Object} operation - OpenAPI operation object
   * @returns {Object} validation config for FoundryDefaultValidationProvider
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
  
    if (operation.requestBody) {
      config.body =
        operation.requestBody.content?.['application/json']?.schema || null;
    }
  
    return config;
  }
  
  /******** FOUNDRY (BEDROCK) UTITLITIES ********/

  /**
   * Creates a SQL table definition from a list of schema objects extracted from an OpenAPI spec's `components.schema` property or a JSON Schema document
   * @param {Object} options
   * @param {Object[]} options.schemas - list of schema definitions to be converted to SQL tables
   * @param {String} options.dialect - the SQL dialect to define the tables in
   * @returns 
   */
  function generateSQLSchema({ schemas, dialect }) {
    const tables = [];
    const migrations = [];
    
    // Process each schema component
    Object.entries(schemas).forEach(([name, definition]) => {
      if (definition.type === 'object') {
        const { tableSQL, relationSQL } = JSONToSQL({ name, definition, dialect });
        tables.push(tableSQL);
        
        if (relationSQL) {
          migrations.push({
            name: `add_${name}_relations`,
            sql: relationSQL
          });
        }
      }
    });

    return {
      schemaSQL: tables.join('\n\n'),
      migrations
    };
  }

  /**
   * @param {Object} options
   * @param {String} options.name
   * @param {Object} options.definition
   * @param {String} options.dialect
   */
  function JSONToSQL({ name, definition, dialect }) {
    const isJunctionTable = name.includes('_') && 
      Object.values(definition.properties || {}).some(
        prop => prop.type === 'array' && prop.items?.$ref
      );
  
    const columns = [];
    const constraints = [];
    let relations = null;
    // Generate example row if any properties have examples
    let exampleRow = '';
  
    // Add standard columns for non-junction tables
    if (!isJunctionTable) {
      const exampleSQL = generateExampleRow(name, definition);

      if (exampleSQL) {
        exampleRow = `\n\n-- EXAMPLE FROM OpenAPI SPECIFICATION\n${exampleSQL}`;
      }

      columns.push(
        // Keep the full UUID generation as DEFAULT
      `_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))`,
        
        // Keep timestamp generation
      `created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
      );
    }
  
    // Process schema properties
    Object.entries(definition.properties || {}).forEach(([propName, propDef]) => {
      // Skip reserved columns
      if (['_id', 'created_at'].includes(propName) && !isJunctionTable) {
        return;
      }

      // Add description as comment above the column
      if (propDef.description) {
        columns.push(`-- ${propDef.description.replace(/\n/g, ' ')}`);
      }

      if (propDef.$ref) {
        const refTable = propDef.$ref.split('/').pop();
        columns.push(`${propName} TEXT`);
        constraints.push(`FOREIGN KEY (${propName}) REFERENCES ${refTable}(_id)`);
      } else if (propDef.type === 'array' && propDef.items?.$ref) {
        const refTable = propDef.items.$ref.split('/').pop();
        relations = `CREATE TABLE IF NOT EXISTS ${name}_${refTable} (
        ${name}_id TEXT REFERENCES ${name}(_id),
        ${refTable}_id TEXT REFERENCES ${refTable}(_id),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (${name}_id, ${refTable}_id)
        );`;
      } else {
        // Handle regular properties
        const columnDef = `${propName} ${getSQLType(propDef.type, dialect, propDef.format)}` +
          (propDef.required ? ' NOT NULL' : '') +
          (propDef.default !== undefined ? ` DEFAULT ${formatDefault(propDef.default)}` : '');
        columns.push(columnDef);
      }
    });
  
    return {
      tableSQL: `CREATE TABLE IF NOT EXISTS ${toSnakeCase(name)} (
      ${columns.join(',\n    ')}
      ${constraints.length > 0 ? ',\n      ' + constraints.join(',\n   ') : ''}
    ); ${exampleRow}`,
      relationSQL: relations
    };
  }

  /**
   * @param {Object} options
   * @param {String} options.name
   * @param {Object} options.definition
   * @param {String} options.dialect
   * @returns {String}
   */
  function JSONPropertyToSQLColumn({ name, definition, dialect }) {
    const base = `${name} ${getSQLType(definition.type, dialect)}`;
    const constraints = [];
    
    if (definition.required) constraints.push('NOT NULL');
    if (definition.default !== undefined) constraints.push(`DEFAULT ${formatDefault(definition.default)}`);
    if (definition.enum) constraints.push(`CHECK (${name} IN (${definition.enum.map(e => `'${e}'`).join(',')}))`);
  
    return base + (constraints.length > 0 ? ' ' + constraints.join(' ') : '');
  }

  /**
   * Generates an example INSERT statement from OpenAPI examples
   * @param {string} tableName 
   * @param {object} definition 
   * @returns {string|null} SQL INSERT statement or null if no examples
   */
  function generateExampleRow(tableName, definition) {
    const exampleValues = {};
    let hasExamples = false;

    // Process properties to collect examples
    Object.entries(definition.properties || {}).forEach(([propName, propDef]) => {
      if (['_id', 'created_at'].includes(propName)) return;
      
      const example = propDef.example ?? propDef.items?.example;
      if (example !== undefined) {
        exampleValues[propName] = normalizeExampleValue(example, propDef);
        hasExamples = true;
      }
    });

    if (!hasExamples) return null;

    const columns = Object.keys(exampleValues);
    const values = columns.map(propName => 
      formatSQLValue(exampleValues[propName])
    );

    return `INSERT INTO ${toSnakeCase(tableName)} (${columns.join(', ')})
  VALUES (${values.join(', ')});`;
  }

  /**
   * Normalizes example values based on their schema definition
   */
  function normalizeExampleValue(value, propDef) {
    // Handle object examples
    if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      return JSON.stringify(value);
    }
    
    // Preserve arrays (they'll be stringified later)
    if (Array.isArray(value)) {
      return value;
    }
    
    // All other values pass through
    return value;
  }

  /**
   * Formats values for safe SQL insertion
   */
  function formatSQLValue(value) {
    if (Array.isArray(value) || typeof value === 'object') {
      return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    }
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  /**
   * Maps JSON Schema types to SQLite column types with dialect-aware conversions
   * @param {String} type - JSON Schema type
   * @param {String} dialect - SQL dialect ('sqlite'|'postgres')
   * @returns {String} SQL column type
   */
  function getSQLType(type, dialect = 'sqlite') {

    const baseType = SQL_TYPE_MAP[type]?.[dialect] || (() => 'TEXT');
    return baseType();
  }

  /**
   * Formats default values for SQL insertion based on type
   * @param {*} value - Default value from schema
   * @returns {String} SQL-safe default value representation
   */
  function formatDefault(value) {
    if (value === null) return 'NULL';
    
    switch(typeof value) {
      case 'string':
        return `'${value.replace(/'/g, "''")}'`; // Escape single quotes
      
      case 'number':
        return value.toString();
      
      case 'boolean':
        return value ? '1' : '0'; // SQLite-friendly boolean
      
      case 'object':
        if (Array.isArray(value)) {
          return `'${JSON.stringify(value)}'`; // Serialize arrays
        }
        if (value instanceof Date) {
          return `'${value.toISOString()}'`; // ISO8601 dates
        }
        return `'${JSON.stringify(value)}'`; // Serialize objects
      
      default:
        return `'${String(value)}'`; // Fallback string conversion
    }
  }
    
  /**
   * Generates a string representation of Express middleware stack by combining
   * path-level and operation-level middleware from OpenAPI extensions.
   * The output is used to inject middleware into generated route handlers.
   * 
   * @param {Object} method - OpenAPI operation object (e.g., GET/POST definition).
   * @param {Object} method.xMiddleware - Operation-specific middleware references
   *   (from `x-middleware` extension). Array of `{ name: string }` objects.
   * @param {Object} route - OpenAPI path item object containing the operation.
   * @param {Object} route.xMiddleware - Path-level middleware references
   *   (from `x-middleware` extension). Array of `{ name: string }` objects.
   * @returns {string} JavaScript code string representing the middleware stack,
   *   formatted as an array of middleware references (e.g., `[mw1, mw2]`).
   * @example
   * // Returns: '[this.#options.middleware?.audit, this.#options.middleware?.authz]'
   * buildMiddlewareStack(
   *   { xMiddleware: [{ name: 'authz' }] },
   *   { xMiddleware: [{ name: 'audit' }] }
   * );
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
      const IN_BEDROCK_AUTOMATED_MODE = process.argv[2] === 'bedrock';
  
      if (IN_INTERACTIVE_MODE) {
        program
          .version(Config.version)
          .command(commands.build.name)
          .description(commands.build.description)
          .action(onInteractiveBuild);
  
        program.parse();
        return;
      }

      /******** FOUNDRY BEDROCK AUTOMATED DEFAULT PATH ********/
      if (IN_BEDROCK_AUTOMATED_MODE) {
        program
        .version(Config.version)
        .command(commands.bedrock.name)
        .description(commands.bedrock.description)
        .requiredOption(...commands.bedrock_build.options.path.flag)
        .addOption(
          new Option(...commands.bedrock_build.options.sql.flag).choices(
            commands.bedrock_build.options.sql.choices
          )
        )
        .option(...commands.bedrock_build.options.output.flag)
        .action(onBuildModels);
        
        program.parse();
        return;
      }

      /******** FOUNDRY CORE AUTOMATED DEFAULT PATH ********/
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
      terminate();
    }
  })();
  