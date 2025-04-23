// __providers/datasources/sqlite.js
import Database from 'better-sqlite3';
import fs from 'fs';

const sqlFilePath = './generated/db/schema.sql';

export class SQLiteDatasource {
  // TODO: Refactor constructor to take pre-initialized database instance
  constructor(dbPath = 'database.db') {
    this._db = new Database(dbPath);
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('foreign_keys = ON');

    const sql = fs.readFileSync(sqlFilePath, 'utf-8');
    this._db.exec(sql);
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
        const stmt = this._db.prepare(`
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
        const stmt = this._db.prepare(`
          INSERT INTO ${tableName} (_id, ${columns.join(', ')})
          VALUES (?, ${columns.map(() => '?').join(', ')})
        `);

        const ids = documents.map(() => crypto.randomUUID());
        
        this._db.transaction(() => {
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
        return this._db.prepare(`
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
        const stmt = this._db.prepare(`
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
        this._db.prepare(`
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
        const stmt = this._db.prepare(query);
        return query.trim().toUpperCase().startsWith('SELECT')
          ? stmt.all(params)
          : stmt.run(params);
      }
    };
  }
}