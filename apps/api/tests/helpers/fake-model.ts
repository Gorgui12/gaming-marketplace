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
/**
 * Identifiants au format ObjectId (24 caractères hexadécimaux).
 *
 * Pas un détail esthétique : le code testé appelle `new Types.ObjectId(id)` —
 * la newsletter convertit ainsi les identifiants d'annonces avant de les
 * stocker — et le constructeur de bson refuse une chaîne qui n'a pas la bonne
 * longueur. Avec des identifiants de type `fake-id-1`, le test échouait sur une
 * BSONError qui n'a rien à voir avec la logique testée.
 */
function nextId(): string {
  idCounter += 1;
  return idCounter.toString(16).padStart(24, '0');
}

/**
 * Lecture d'un chemin pointé (`marketing.optedIn`) dans un document.
 * Mongoose résout ces clés en parcourant les sous-documents ; sans ça, la
 * newsletter et le consentement marketing seraient imbriqués sur une chaîne
 * littérale qui n'existe jamais, et les tests passeraient à vide.
 */
function getPath(doc: Doc, key: string): unknown {
  if (!key.includes('.')) return doc[key];
  let current: unknown = doc;
  for (const part of key.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Vérité d'une valeur absente, pour les opérateurs de comparaison. */
function present(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function matchesFilter(doc: Doc, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') {
      const clauses = expected as Record<string, unknown>[];
      return clauses.some((clause) => matchesFilter(doc, clause));
    }
    const actual = getPath(doc, key);

    if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
      const ops = expected as Record<string, unknown>;
      return Object.entries(ops).every(([op, val]) => {
        switch (op) {
          case '$gt':
            return present(actual) && compare(actual) > compare(val);
          case '$gte':
            return present(actual) && compare(actual) >= compare(val);
          case '$lt':
            return present(actual) && compare(actual) < compare(val);
          case '$lte':
            return present(actual) && compare(actual) <= compare(val);
          case '$in':
            return Array.isArray(val) && val.some((v) => String(v) === String(actual));
          // Utilisé par la sélection de la newsletter pour écarter les
          // annonces déjà mises en avant. On normalise les ObjectId en
          // chaîne, sinon `String(ObjectId)` et `String(id)` ne
          // correspondraient pas.
          case '$nin':
            return (
              Array.isArray(val) && !val.some((v) => present(actual) && String(v) === String(actual))
            );
          case '$ne':
            // MongoDB: `$ne` sélectionne les documents où le champ est
            // absent. Reproduit ici, sinon `token: {$ne: null}` remonterait
            // des comptes sans jeton.
            return !present(actual) || String(actual) !== String(val);
          case '$exists':
            return val ? present(actual) : !present(actual);
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

/** Écrit une valeur en chemin pointé (`marketing.optedIn`), en créant les paliers manquants. */
function setPath(doc: Doc, key: string, value: unknown): void {
  const parts = key.split('.');
  let current = doc;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    const next = current[part];
    if (next === null || typeof next !== 'object') {
      current[part] = {};
    }
    current = current[part] as Doc;
  }
  current[parts[parts.length - 1]!] = value;
}

/** Supprime une valeur en chemin pointé. */
function unsetPath(doc: Doc, key: string): void {
  const parts = key.split('.');
  let current: unknown = doc;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (current === null || typeof current !== 'object') return;
    current = (current as Record<string, unknown>)[parts[i]!];
  }
  if (current !== null && typeof current === 'object') {
    delete (current as Record<string, unknown>)[parts[parts.length - 1]!];
  }
}

function applyUpdate(doc: Doc, update: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(update)) {
    if (key === '$set') {
      for (const [path, val] of Object.entries(value as Record<string, unknown>)) {
        setPath(doc, path, val);
      }
    } else if (key === '$unset') {
      for (const path of Object.keys(value as Record<string, unknown>)) {
        unsetPath(doc, path);
      }
    } else if (key === '$inc') {
      for (const [path, delta] of Object.entries(value as Record<string, number>)) {
        setPath(doc, path, ((getPath(doc, path) as number) ?? 0) + delta);
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
  populate(path: string, fields?: string): SingleQueryChain<T>;
  lean(): SingleQueryChain<T>;
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
    // `populate()` est un no-op côté fake : le store ne contient pas de
    // collections liées à résoudre. Présent pour que le code testé puisse
    // chaîner .populate().lean() comme en Mongoose.
    populate() {
      return chain;
    },
    // `lean()` est un no-op côté fake : présent pour que le code testé puisse
    // chaîner .select().lean() comme en Mongoose.
    lean() {
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
  populate(path: string, fields?: string): QueryChain<T>;
  lean(): QueryChain<T>;
}

/**
 * Tri multi-champs, comme le fait MongoDB : `sort({ views: -1, createdAt: -1 })`
 * classe sur la première clé, puis départage les égalités sur la suivante.
 * L'implémentation précédente ne retenait que la première clé, ce qui suffisait
 * aux tests existants mais rendrait la sélection de la newsletter (qui départage
 * les annonces à vues égales par ancienneté) non testable.
 */
function sortDocs<T extends Doc>(items: T[], spec: Record<string, 1 | -1>): T[] {
  const entries = Object.entries(spec);
  return [...items].sort((a, b) => {
    for (const [field, dir] of entries) {
      const av = compare(getPath(a, field));
      const bv = compare(getPath(b, field));
      if (av !== bv) return dir === -1 ? bv - av : av - bv;
    }
    return 0;
  });
}

function makeQueryChain<T extends Doc>(items: T[]): QueryChain<T> {
  let result = [...items];
  const chain = {
    sort(spec: Record<string, 1 | -1>) {
      result = sortDocs(result, spec);
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
    // No-op : voir makeSingleQueryChain.
    populate() {
      return chain;
    },
    lean() {
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

    async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>) {
      const doc = [...store.values()].find((d) => matchesFilter(d, filter));
      if (!doc) return { modifiedCount: 0 };
      applyUpdate(doc, update);
      store.set(doc._id, doc);
      return { modifiedCount: 1 };
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
