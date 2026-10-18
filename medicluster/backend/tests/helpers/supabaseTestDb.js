const { PGlite } = require('@electric-sql/pglite');
const { readFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const { randomBytes } = require('node:crypto');
const path = require('node:path');

function hydrateDates(value) {
  if (Array.isArray(value)) return value.map(hydrateDates);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, hydrateDates(entry)]));
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return new Date(value);
  return value;
}

const rpcParameters = {
  mc_find: ['p_collection', 'p_filter', 'p_sort', 'p_limit', 'p_skip'],
  mc_count: ['p_collection', 'p_filter'],
  mc_write: ['p_collection', 'p_action', 'p_filter', 'p_update', 'p_document', 'p_upsert', 'p_return_new', 'p_sort'],
  mc_reserve_email: ['p_hash'],
  mc_cleanup_expired: ['p_limit'],
};

async function createTestDatabase(t) {
  const sql = new PGlite();
  await sql.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  await sql.exec(await readFile(path.join(__dirname, '../../supabase/migrations/20261018_medicluster_storage.sql'), 'utf8'));
  const invoke = async (name, args = {}) => {
    const keys = rpcParameters[name].filter(key => Object.hasOwn(args, key));
    const params = keys.map(key => typeof args[key] === 'object' && args[key] !== null ? JSON.stringify(args[key]) : args[key]);
    const named = keys.map((key, index) => `${key} => $${index + 1}`).join(',');
    return sql.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE service_role');
      const { rows } = await tx.query(`SELECT public.${name}(${named}) AS result`, params);
      return rows[0].result;
    });
  };
  const server = createServer(async (req, res) => {
    const name = req.url.replace(/^\/rest\/v1\/rpc\//, '').split('?')[0];
    if (req.method !== 'POST' || !Object.hasOwn(rpcParameters, name)) {
      res.writeHead(404).end(); return;
    }
    if (req.headers.apikey !== 'test-service-role' && req.headers.authorization !== 'Bearer test-service-role') {
      res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ message: 'Unauthorized fixture request' })); return;
    }
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const result = await invoke(name, JSON.parse(Buffer.concat(chunks).toString() || '{}'));
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(error.code === '23505' ? 409 : 400, { 'content-type': 'application/json' }).end(JSON.stringify({ code: error.code, message: error.message }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const previous = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY };
  process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
  process.env.SUPABASE_SECRET_KEY = 'test-service-role';
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await sql.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const collection = name => {
    const write = (action, filter = {}, update = {}, extras = {}) => invoke('mc_write', {
      p_collection: name, p_action: action, p_filter: filter, p_update: update, ...extras,
    });
    const api = {
      async findOne(filter = {}) { return hydrateDates((await invoke('mc_find', { p_collection: name, p_filter: filter, p_limit: 1 }))[0] || null); },
      find(filter = {}) {
        const options = { p_collection: name, p_filter: filter };
        const cursor = {
          sort(sort) { options.p_sort = Array.isArray(sort) ? sort : Object.entries(sort); return cursor; },
          limit(limit) { options.p_limit = limit; return cursor; },
          skip(skip) { options.p_skip = skip; return cursor; },
          async toArray() { return hydrateDates(await invoke('mc_find', options)); },
        };
        return cursor;
      },
      async insertOne(document) {
        const doc = { ...document, _id: String(document._id || randomBytes(12).toString('hex')) };
        await write('insert', {}, {}, { p_document: doc });
        return { insertedId: doc._id };
      },
      async insertMany(documents) {
        const insertedIds = {};
        for (const [index, document] of documents.entries()) insertedIds[index] = (await api.insertOne(document)).insertedId;
        return { insertedCount: documents.length, insertedIds };
      },
      async updateOne(filter, update, options = {}) {
        const before = await write('update', filter, update, { p_upsert: Boolean(options.upsert), p_return_new: false });
        return { matchedCount: before ? 1 : 0, modifiedCount: before ? 1 : 0 };
      },
      updateMany(filter, update) { return write('update_many', filter, update); },
      deleteMany(filter = {}) { return write('delete_many', filter); },
      countDocuments(filter = {}) { return invoke('mc_count', { p_collection: name, p_filter: filter }); },
    };
    return api;
  };
  return { sql, collection, rpc: invoke };
}

module.exports = { createTestDatabase };
