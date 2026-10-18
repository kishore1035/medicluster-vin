const { rpc } = require('./supabase');
const { createId } = require('./ids');

const SCHEMA = Symbol('recordSchema');
const STATE = Symbol('recordState');
function schema(definition, options = {}) {
  const fields = Object.fromEntries(Object.entries(definition).filter(([key, value]) => !(key === '_id' && value === false)));
  return { [SCHEMA]: true, definition: fields, options, methods: {} };
}
const clone = value => value === undefined ? undefined : structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function validation(path, message) {
  const error = new Error(`${path}: ${message}`);
  error.name = 'ValidationError';
  error.status = 400;
  return error;
}
function descriptor(field) {
  if (field?.[SCHEMA]) return { type: field };
  if (typeof field === 'function' || Array.isArray(field)) return { type: field };
  if (field && Object.hasOwn(field, 'type')) {
    if (field.type && typeof field.type === 'object' && !Array.isArray(field.type) && !field.type[SCHEMA]) {
      return { ...field, type: schema(field.type) };
    }
    return field;
  }
  return { type: schema(field || {}) };
}
function fieldsOf(definition) { return definition?.[SCHEMA] ? definition.definition : definition; }
function normalizeValue(value, field, path, defaults = true, required = true) {
  const d = descriptor(field);
  if (value === undefined && defaults) {
    if (Object.hasOwn(d, 'default')) value = typeof d.default === 'function' ? d.default() : clone(d.default);
    else if (Array.isArray(d.type)) value = [];
    else if (d.type?.[SCHEMA] && !field?.type) value = {};
  }
  if (value === undefined || value === null) {
    if (required && d.required) throw validation(path, 'is required');
    return value;
  }
  if (Array.isArray(d.type)) {
    const values = Array.isArray(value) ? value : [value];
    const itemField = descriptor(d.type[0] || Object);
    return values.map((item, index) => normalizeValue(item, { ...itemField, ...(d.enum ? { enum: d.enum } : {}) }, `${path}.${index}`, defaults, required));
  }
  if (d.type?.[SCHEMA]) return normalizeObject(value, d.type.definition, defaults, required, path);
  if (d.type === String) {
    value = String(value);
    if (d.trim) value = value.trim();
    if (d.lowercase) value = value.toLowerCase();
    if (d.uppercase) value = value.toUpperCase();
    if (required && d.required && !value.length) throw validation(path, 'is required');
  } else if (d.type === Number) {
    value = Number(value);
    if (!Number.isFinite(value)) throw validation(path, 'must be a finite number');
  } else if (d.type === Boolean) {
    if (value === 'false' || value === '0' || value === 0) value = false;
    else if (value === 'true' || value === '1' || value === 1) value = true;
    else if (typeof value !== 'boolean') throw validation(path, 'must be a boolean');
  } else if (d.type === Date) {
    value = new Date(value);
    if (!Number.isFinite(value.getTime())) throw validation(path, 'must be a valid date');
  } else if (d.type === Map) {
    const entries = value instanceof Map ? [...value.entries()] : Object.entries(value);
    value = Object.fromEntries(entries.map(([key, item]) => [key, normalizeValue(item, d.of || Object, `${path}.${key}`, defaults, required)]));
  } else value = clone(value);
  if (d.enum && !d.enum.includes(value)) throw validation(path, 'has an unsupported value');
  if (d.min !== undefined && value < d.min) throw validation(path, `must be at least ${d.min}`);
  if (d.max !== undefined && value > d.max) throw validation(path, `must be at most ${d.max}`);
  return value;
}
function normalizeObject(value, fields, defaults = true, required = true, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw validation(prefix || 'document', 'must be an object');
  const result = {};
  for (const [key, field] of Object.entries(fields)) {
    const normalized = normalizeValue(value[key], field, prefix ? `${prefix}.${key}` : key, defaults, required);
    if (normalized !== undefined) result[key] = normalized;
  }
  return result;
}
function getPath(object, path) { return path.split('.').reduce((value, key) => value?.[key], object); }
function setPath(object, path, value) {
  const parts = path.split('.');
  let target = object;
  for (const part of parts.slice(0, -1)) target = target[part] ||= {};
  target[parts.at(-1)] = value;
}
function deletePath(object, path) {
  const parts = path.split('.');
  const target = parts.slice(0, -1).reduce((value, key) => value?.[key], object);
  if (target) delete target[parts.at(-1)];
}
function fieldAt(fields, path) {
  let field;
  for (const part of path.split('.')) {
    field = fields?.[part];
    if (field === undefined) return undefined;
    let type = descriptor(field).type;
    if (Array.isArray(type)) type = descriptor(type[0] || Object).type;
    fields = type?.[SCHEMA] ? type.definition : (type && typeof type === 'object' && !Array.isArray(type) ? type : null);
  }
  return field;
}
function hiddenPaths(fields, prefix = '') {
  const paths = [];
  for (const [key, field] of Object.entries(fields)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const d = descriptor(field);
    if (d.select === false) paths.push(path);
    else if (d.type?.[SCHEMA]) paths.push(...hiddenPaths(d.type.definition, path));
  }
  return paths;
}
function projectionSpec(selection) {
  if (!selection) return {};
  if (typeof selection === 'string') return Object.fromEntries(selection.trim().split(/\s+/).filter(Boolean).map(value => [value.replace(/^[-+]/, ''), value.startsWith('-') ? 0 : value.startsWith('+') ? '+' : 1]));
  return selection;
}
function project(value, selection, hidden) {
  const spec = projectionSpec(selection);
  const include = Object.entries(spec).filter(([key, flag]) => key !== '_id' && flag !== '+' && Boolean(flag));
  const inclusive = include.length > 0 || Object.keys(spec).length === 1 && spec._id === 1;
  const projected = inclusive ? {} : clone(value);
  if (inclusive) {
    for (const [key] of include) {
      const item = getPath(value, key);
      if (item !== undefined) setPath(projected, key, clone(item));
    }
    if (spec._id !== 0 && value._id !== undefined) projected._id = value._id;
    for (const [key, flag] of Object.entries(spec)) {
      if (flag === '+' && getPath(value, key) !== undefined) setPath(projected, key, clone(getPath(value, key)));
    }
  }
  for (const path of hidden) if (!spec[path]) deletePath(projected, path);
  for (const [path, flag] of Object.entries(spec)) if (!flag) deletePath(projected, path);
  return projected;
}
function sortSpec(value) {
  if (Array.isArray(value)) return value.map(([field, direction]) => [field, direction]);
  if (typeof value !== 'string') return Object.entries(value || {});
  return value.split(/\s+/).filter(Boolean).map(path => [path.replace(/^[-+]/, ''), path.startsWith('-') ? -1 : 1]);
}

class Query {
  constructor(execute) { this.execute = execute; this.options = {}; }
  sort(value) { this.options.sort = sortSpec(value); return this; }
  skip(value) { this.options.skip = Math.max(0, Number(value) || 0); return this; }
  limit(value) { this.options.limit = Math.max(0, Number(value) || 0); return this; }
  select(value) {
    this.options.selection = { ...projectionSpec(this.options.selection), ...projectionSpec(value) };
    return this;
  }
  lean(value = true) { this.options.lean = value; return this; }
  exec() { return this.promise ||= Promise.resolve().then(() => this.execute(this.options)); }
  then(resolve, reject) { return this.exec().then(resolve, reject); }
  catch(reject) { return this.exec().catch(reject); }
  finally(callback) { return this.exec().finally(callback); }
}

function defineModel(name, definition, options = {}) {
  const source = definition?.[SCHEMA] ? definition : schema(definition, options);
  const modelOptions = { ...source.options, ...options };
  const collection = modelOptions.collection || `${name.toLowerCase()}${name.endsWith('s') || name.endsWith('ch') ? 'es' : 's'}`;
  const fields = { ...fieldsOf(source), _id: source.definition._id || String };
  if (modelOptions.timestamps) Object.assign(fields, { createdAt: Date, updatedAt: Date });
  const hidden = hiddenPaths(fields);

  class Model {
    constructor(values = {}, internal = null) {
      const data = internal ? clone(values) : prepare(values);
      Object.assign(this, data);
      Object.defineProperty(this, STATE, { value: { persisted: Boolean(internal), original: clone(data) }, writable: true });
    }
    get id() { return this._id; }
    toObject() { return Object.fromEntries(Object.entries(this).map(([key, value]) => [key, clone(value)])); }
    toJSON() { return this.toObject(); }
    async save() {
      if (!this[STATE].persisted) {
        const stored = await rpc('mc_write', { p_collection: collection, p_action: 'insert', p_document: prepare(this.toObject()) });
        Object.assign(this, hydrate(stored));
      } else {
        const current = this.toObject();
        const original = this[STATE].original;
        const update = { $set: {}, $unset: {} };
        for (const key of new Set([...Object.keys(original), ...Object.keys(current)])) {
          if (key === '_id' || key === 'createdAt' || key === 'updatedAt' || same(original[key], current[key])) continue;
          if (current[key] === undefined) update.$unset[key] = 1;
          else update.$set[key] = current[key];
        }
        if (Object.keys(update.$set).length || Object.keys(update.$unset).length) {
          const result = await rpc('mc_write', { p_collection: collection, p_action: 'update', p_filter: { _id: this._id }, p_update: prepareUpdate(update), p_return_new: true });
          if (!result) throw new Error('This record no longer exists.');
          // Keep the original field selection when refreshing a saved document.
          const hydrated = hydrate(result);
          for (const key of Object.keys(current)) if (Object.hasOwn(hydrated, key)) this[key] = hydrated[key];
          for (const key of Object.keys(update.$unset)) delete this[key];
        }
      }
      this[STATE] = { persisted: true, original: this.toObject() };
      return this;
    }
    deleteOne() { return Model.deleteOne({ _id: this._id }); }
    static create(values) {
      if (Array.isArray(values)) return Promise.all(values.map(value => new Model(value).save()));
      return new Model(values).save();
    }
    static insertMany(values) { return Promise.all(values.map(value => Model.create(value))); }
    static find(filter = {}, selection) { return findQuery(filter, false, selection); }
    static findOne(filter = {}, selection) { return findQuery(filter, true, selection); }
    static findById(id, selection) { return Model.findOne({ _id: String(id) }, selection); }
    static findOneAndUpdate(filter, update, opts = {}) { return writeQuery('update', filter, update, opts); }
    static findByIdAndUpdate(id, update, opts = {}) { return Model.findOneAndUpdate({ _id: String(id) }, update, opts); }
    static findOneAndDelete(filter, opts = {}) { return writeQuery('delete', filter, {}, opts); }
    static findByIdAndDelete(id, opts = {}) { return Model.findOneAndDelete({ _id: String(id) }, opts); }
    static async updateOne(filter, update, opts = {}) {
      const result = await writeQuery('update', filter, update, { ...opts, new: true });
      return { acknowledged: true, matchedCount: result ? 1 : 0, modifiedCount: result ? 1 : 0 };
    }
    static updateMany(filter, update) { return rpc('mc_write', { p_collection: collection, p_action: 'update_many', p_filter: filter, p_update: prepareUpdate(update) }); }
    static async deleteOne(filter) {
      const result = await rpc('mc_write', { p_collection: collection, p_action: 'delete', p_filter: filter });
      return { acknowledged: true, deletedCount: result ? 1 : 0 };
    }
    static deleteMany(filter = {}) { return rpc('mc_write', { p_collection: collection, p_action: 'delete_many', p_filter: filter }); }
    static countDocuments(filter = {}) { return rpc('mc_count', { p_collection: collection, p_filter: filter }); }
    static exists(filter = {}) { return Model.findOne(filter, { _id: 1 }).lean(); }
    static async bulkWrite(operations) {
      const counts = { acknowledged: true, matchedCount: 0, modifiedCount: 0, insertedCount: 0, deletedCount: 0, upsertedCount: 0 };
      for (const operation of operations) {
        if (operation.updateOne) {
          const { filter, update, upsert } = operation.updateOne;
          const result = await Model.updateOne(filter, update, { upsert });
          counts.matchedCount += result.matchedCount;
          counts.modifiedCount += result.modifiedCount;
        } else if (operation.insertOne) { await Model.create(operation.insertOne.document); counts.insertedCount++; }
        else if (operation.deleteOne) counts.deletedCount += (await Model.deleteOne(operation.deleteOne.filter)).deletedCount;
        else throw new Error('Unsupported bulk operation.');
      }
      return counts;
    }
  }
  function prepare(values) {
    const data = normalizeObject(values, fields);
    if (data._id === undefined) data._id = createId();
    if (modelOptions.timestamps) {
      data.createdAt ||= new Date();
      data.updatedAt ||= new Date();
    }
    return data;
  }
  function hydrate(values) { return normalizeObject(values, fields, false, false); }
  function result(values, queryOptions) {
    if (values === null || values === undefined) return null;
    const projected = project(hydrate(values), queryOptions.selection, hidden);
    return queryOptions.lean ? projected : new Model(projected, true);
  }
  function findQuery(filter, one, selection) {
    const query = new Query(async queryOptions => {
      const documents = await rpc('mc_find', {
        p_collection: collection, p_filter: filter, p_sort: queryOptions.sort || [],
        p_limit: one ? 1 : queryOptions.limit || null, p_skip: queryOptions.skip || 0,
      });
      return one ? result(documents[0], queryOptions) : documents.map(document => result(document, queryOptions));
    });
    if (selection) query.select(selection);
    return query;
  }
  function prepareUpdate(update) {
    const operators = Object.keys(update).some(key => key.startsWith('$')) ? clone(update) : { $set: clone(update) };
    for (const [operator, changes] of Object.entries(operators)) {
      if (!['$set', '$setOnInsert', '$unset', '$inc', '$push', '$addToSet', '$pull'].includes(operator)) throw new Error(`Unsupported update operator: ${operator}`);
      for (const [path, value] of Object.entries(changes || {})) {
        const field = fieldAt(fields, path);
        if (path === '_id' || path === 'createdAt') { delete changes[path]; continue; }
        if (!field) { delete changes[path]; continue; }
        if (operator === '$set' || operator === '$setOnInsert') changes[path] = normalizeValue(value, field, path, true, true);
        if (operator === '$push' || operator === '$addToSet') {
          const type = descriptor(field).type;
          if (!Array.isArray(type)) throw validation(path, 'must be an array');
          if (value?.$each) changes[path] = { ...value, $each: value.$each.map(item => normalizeValue(item, type[0], path)) };
          else changes[path] = normalizeValue(value, type[0], path);
        }
      }
    }
    if (modelOptions.timestamps) operators.$set = { ...operators.$set, updatedAt: new Date() };
    return operators;
  }
  function writeQuery(action, filter, update, opts) {
    const query = new Query(async queryOptions => {
      let defaults = {};
      if (opts.upsert) {
        // The database applies this seed only if the atomic update inserts a row.
        defaults = normalizeObject({}, fields, true, false);
        defaults._id ||= typeof filter._id === 'string' ? filter._id : createId();
        if (modelOptions.timestamps) defaults.createdAt = new Date();
      }
      const document = await rpc('mc_write', {
        p_collection: collection, p_action: action, p_filter: filter,
        p_update: action === 'delete' ? {} : prepareUpdate(update), p_document: defaults,
        p_upsert: Boolean(opts.upsert), p_return_new: Boolean(opts.new), p_sort: queryOptions.sort || sortSpec(opts.sort),
      });
      return result(document, queryOptions);
    });
    if (opts.select) query.select(opts.select);
    return query;
  }
  Object.assign(Model.prototype, source.methods, modelOptions.methods);
  Model.collection = { name: collection };
  Model.modelName = name;
  return Model;
}

module.exports = { defineModel, schema };
