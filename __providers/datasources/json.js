export class JSONDatasource {
    constructor() {
      this._collections = new Map(); // { collectionName: Map<id, document> }
    }
    
    /**
     * @param {String} collectionName - name of the collection to initialize
     */
    collection(collectionName) {
      if (!this._collections.has(collectionName)) {
        this._collections.set(collectionName, new Map());
      }
  
      return {
        /**
         * Seeds an existing collection with data
         * @param {Object[]} initialData - list of objects to seed
         * @returns 
         */
        init: (initialData = []) => {
          const collection = this._collections.get(collectionName);
          initialData.forEach((doc) => {
            const id = !doc.id ? crypto.randomUUID() : doc.id;
            collection.set(id, { ...doc, id });
          });
          return this;
        },
        
        /**
         * Creates a new document in the datastore
         * @param {Object} document 
         * @returns {String}
         */
        insert: async (document) => {
          const collection = this._collections.get(collectionName);
          const id = crypto.randomUUID();
          const created_at = new Date().toISOString();
          collection.set(id, { ...document, id, created_at });
          return id;
        },
        
        /**
         * Creates a series of new documents in the datastore
         * @param {Object[]} documents 
         * @returns {String[]}
         */
        insertMany: async (documents) => {
          const collection = this._collections.get(collectionName);
          const ids = documents.map((doc) => {
            const id = crypto.randomUUID();
            collection.set(id, { ...doc, id });
            return id;
          });
          return ids;
        },
        
        /**
         * Fetches a document by its `id` property
         * @param {String} id 
         * @returns {Object}
         */
        getById: async (id) => {
          const collection = this._collections.get(collectionName);
          return collection.get(id) || null;
        },
        
        /**
         * Finds a list of documents in the datastore based on a query specification object
         * @param {Object} query - map of criteria a document must match to be included in the result set
         * @returns {Object[]}
         */
        find: async (query = {}) => {
          const collection = this._collections.get(collectionName);
          return Array.from(collection.values()).filter((doc) => {
            return Object.entries(query).every(([key, value]) => {
              return doc[key] === value;
            });
          });
        },
        
        /**
         * Updates a specified document's properties via an update-in-place
         * @param {String} id 
         * @param {Object} updates 
         */
        update: async (id, updates) => {
          const collection = this._collections.get(collectionName);
          if (collection.has(id)) {
            const current = collection.get(id);
            collection.set(id, { ...current, ...updates });
          }
        },
        /**
         * Removes a specified document from a collection by id
         * @param {String} id 
         * @returns {void}
         */
        delete: async (id) => {
          const collection = this._collections.get(collectionName);
          collection.delete(id);
        },
        
        /**
         * Removes all documents from a collection
         * @returns {void}
         */
        clear: async () => {
          this._collections.get(collectionName).clear();
        },
      };
    }
  }