/**
 * Fake Mongoose model minimal mais suffisant pour tester la logique métier
 * des services sans base de données réelle (indisponible dans cet
 * environnement — voir tests/README.md). Supporte le sous-ensemble de
 * l'API Mongoose réellement utilisé par les services: create, findById,
 * findOne, find (avec sort/skip/limit), countDocuments,
 * findByIdAndUpdate, findOneAndUpdate, updateMany, et des documents avec
 * .save().
 *
 * Ce n'est PAS un remplacement de tests d'intégration contre une vraie
 * MongoDB — c'est un filet de sécurité sur la logique métier pure. Avant
 * la mise en production, ces tests doivent être complétés par de vrais
 * tests d'intégration (mongodb-memory-server ou une instance MongoDB de
 * test) — voir tests/README.md.
 */

type Doc = Record<string, unknown> & { _id: string };

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `fake-id-${idCounter}`;
}

function matchesFilter(doc: Doc, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') {
      const clauses = expected as Record<string, unknown>[];
      return clauses.some((clause) => matchesFilter(doc, clause));
    }
    const actual = doc[key];

    if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
      const ops = expected as Record<string, unknown>;
      return Object.entries(ops).every(([op, val]) => {
        switch (op) {
          case '$gt':
            return compare(actual) > compare(val);
          case '$gte':
            return compare(actual) >= compare(val);
          case '$lt':
            return compare(actual) < compare(val);
          case '$lte':
            return compare(actual) <= compare(val);
          case '$in':
            return Array.isArray(val) && val.some((v) => String(v) === String(actual));
          case '$ne':
            return String(actual) !== String(val);
          case '$exists':
            return val ? actual !== undefined : actual === undefined;
          default:
            return true;
        }
      });
    }

    return String(actual) === String(expected);
  });
}

function compare(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return Number(value);
}

function applyUpdate(doc: Doc, update: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(update)) {
    if (key === '$set') {
      Object.assign(doc, value as Record<string, unknown>);
    } else if (key === '$inc') {
      for (const [field, delta] of Object.entries(value as Record<string, number>)) {
        doc[field] = ((doc[field] as number) ?? 0) + delta;
      }
    } else {
      doc[key] = value;
    }
  }
}

function attachInstanceMethods<T extends Doc>(doc: T, store: Map<string, Doc>): T {
  Object.defineProperty(doc, 'save', {
    value: async () => {
      store.set(doc._id, doc);
      return doc;
    },
    enumerable: false,
  });
  return doc;
}

interface SingleQueryChain<T> extends Promise<T | null> {
  select(fields: string): SingleQueryChain<T>;
  sort(spec: Record<string, 1 | -1>): SingleQueryChain<T>;
}

function makeSingleQueryChain<T extends Doc>(
  resolve: (sortSpec: Record<string, 1 | -1> | null) => T | null,
): SingleQueryChain<T> {
  let sortSpec: Record<string, 1 | -1> | null = null;
  const chain = {
    select() {
      return chain;
    },
    sort(spec: Record<string, 1 | -1>) {
      sortSpec = spec;
      return chain;
    },
    then(onFulfilled: (v: T | null) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(resolve(sortSpec)).then(onFulfilled, onRejected);
    },
    catch(onRejected: (e: unknown) => unknown) {
      return Promise.resolve(resolve(sortSpec)).catch(onRejected);
    },
  };
  return chain as unknown as SingleQueryChain<T>;
}
interface QueryChain<T> extends Promise<T[]> {
  sort(spec: Record<string, 1 | -1>): QueryChain<T>;
  skip(n: number): QueryChain<T>;
  limit(n: number): QueryChain<T>;
  select(fields: string): QueryChain<T>;
}

function makeQueryChain<T extends Doc>(items: T[]): QueryChain<T> {
  let result = [...items];
  const chain = {
    sort(spec: Record<string, 1 | -1>) {
      const [field, dir] = Object.entries(spec)[0] ?? [];
      if (field) {
        result = [...result].sort((a, b) => {
          const av = compare(a[field]);
          const bv = compare(b[field]);
          return dir === -1 ? bv - av : av - bv;
        });
      }
      return chain;
    },
    skip(n: number) {
      result = result.slice(n);
      return chain;
    },
    limit(n: number) {
      result = result.slice(0, n);
      return chain;
    },
    select() {
      return chain;
    },
    then(onFulfilled: (v: T[]) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return chain as unknown as QueryChain<T>;
}

export function createFakeModel<T extends Record<string, unknown>>() {
  const store = new Map<string, Doc>();

  return {
    __store: store,

    async create(input: Partial<T>): Promise<T & Doc> {
      const doc = { _id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...input } as Doc;
      attachInstanceMethods(doc, store);
      store.set(doc._id, doc);
      return doc as T & Doc;
    },

    findById(id: string) {
      return makeSingleQueryChain<Doc>(() => {
        const doc = store.get(String(id));
        return doc ? attachInstanceMethods({ ...doc }, store) : null;
      });
    },

    findOne(filter: Record<string, unknown> = {}) {
      return makeSingleQueryChain<Doc>((sortSpec) => {
        let matches = [...store.values()].filter((d) => matchesFilter(d, filter));
        if (sortSpec) {
          const [field, dir] = Object.entries(sortSpec)[0] ?? [];
          if (field) {
            matches = [...matches].sort((a, b) => {
              const av = compare(a[field]);
              const bv = compare(b[field]);
              return dir === -1 ? bv - av : av - bv;
            });
          }
        }
        const doc = matches[0];
        return doc ? attachInstanceMethods({ ...doc }, store) : null;
      });
    },

    find(filter: Record<string, unknown> = {}) {
      const items = [...store.values()].filter((d) => matchesFilter(d, filter));
      return makeQueryChain(items.map((d) => attachInstanceMethods({ ...d }, store)));
    },

    async countDocuments(filter: Record<string, unknown> = {}) {
      return [...store.values()].filter((d) => matchesFilter(d, filter)).length;
    },

    async findByIdAndUpdate(
      id: string,
      update: Record<string, unknown>,
      opts?: { new?: boolean },
    ) {
      const doc = store.get(String(id));
      if (!doc) return null;
      applyUpdate(doc, update);
      store.set(doc._id, doc);
      return opts?.new ? attachInstanceMethods({ ...doc }, store) : null;
    },

    async findOneAndUpdate(
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      opts?: { new?: boolean; upsert?: boolean },
    ) {
      let doc = [...store.values()].find((d) => matchesFilter(d, filter));
      if (!doc && opts?.upsert) {
        doc = { _id: nextId(), ...filter } as Doc;
        store.set(doc._id, doc);
      }
      if (!doc) return null;
      applyUpdate(doc, update);
      store.set(doc._id, doc);
      return attachInstanceMethods({ ...doc }, store);
    },

    async updateMany(filter: Record<string, unknown>, update: Record<string, unknown>) {
      const items = [...store.values()].filter((d) => matchesFilter(d, filter));
      for (const doc of items) {
        applyUpdate(doc, update);
        store.set(doc._id, doc);
      }
      return { modifiedCount: items.length };
    },

    // Simule une contrainte d'unicité applicative pour les tests
    // d'idempotence webhook (voir payment-event.model.ts: index unique sur
    // providerEventId). L'appelant du test déclenche ceci explicitement.
    simulateDuplicateKeyError(): never {
      const err = new Error('E11000 duplicate key error') as Error & { code: number };
      err.code = 11000;
      throw err;
    },

    __reset() {
      store.clear();
    },
  };
}
