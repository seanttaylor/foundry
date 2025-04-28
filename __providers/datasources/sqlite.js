const sqlFilePath = './generated/db/schema.sql';

export default class SQLiteDatasource {
  constructor(db) {
    this.__db = db;
  }

  /**
   * 
   * @param {String} tableName 
   * @returns {Object}
   */
  collection(tableName) {
    return {
      init: () => {
        // No-op initialization (SQL schemas managed separately)
      },
      /**
       * 
       * @param {Object} document 
       * @returns {String}
       */
      insert: async (document) => {
        const id = crypto.randomUUID();
        const columns = Object.keys(document);
        const stmt = this.__db.prepare(`
          INSERT INTO ${tableName} (_id, ${columns.join(', ')})
          VALUES (?, ${columns.map(() => '?').join(', ')})
        `);
        stmt.run(id, ...Object.values(document));
        return id;
      },
      /**
       * 
       * @param {Object[]} documents 
       * @returns {String[]}
       */
      insertMany: async (documents) => {
        if (documents.length === 0) return [];
        
        const columns = Object.keys(documents[0]);
        const stmt = this.__db.prepare(`
          INSERT INTO ${tableName} (_id, ${columns.join(', ')})
          VALUES (?, ${columns.map(() => '?').join(', ')})
        `);

        const ids = documents.map(() => crypto.randomUUID());
        
        this.__db.transaction(() => {
          documents.forEach((doc, i) => {
            stmt.run(ids[i], ...Object.values(doc));
          });
        })();

        return ids;
      },
      /**
       * 
       * @param {String} id 
       * @returns {Object}
       */
      getById: async (id) => {
        return this.__db.prepare(`
          SELECT * FROM ${tableName} 
          WHERE _id = ?
        `).get(id);
      },
      /**
       * 
       * @param {String} id 
       * @param {Object} updates 
       * @returns {void}
       */
      update: async (id, updates) => {
        const columns = Object.keys(updates);
        const stmt = this.__db.prepare(`
          UPDATE ${tableName}
          SET ${columns.map(c => `${c} = ?`).join(', ')}
          WHERE _id = ?
        `);
        stmt.run(...Object.values(updates), id);
      },
      /**
       * 
       * @param {String} id 
       * @returns {void}
       */
      delete: async (id) => {
        this.__db.prepare(`
          DELETE FROM ${tableName} 
          WHERE _id = ?
        `).run(id);
      },

      /**
       * Convenience query API to implemented later
       * @returns {void}
       */
      find: () => Promise.resolve([]),

      /**
       * Runs arbitrary SQL statements
       * @param {Object} query 
       * @param {Any[]} params 
       * @returns 
       */
      sql: (query, params = []) => {
        const stmt = this.__db.prepare(query);
        return query.trim().toUpperCase().startsWith('SELECT')
          ? stmt.all(params)
          : stmt.run(params);
      }
    };
  }
}