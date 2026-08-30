// Azure SQL access, behind the same tiny prepare/bind/first/all/run surface the
// rest of the code already uses. Keeping the shape means the business logic
// never learns which database it is talking to.
//
// The pool is module-level and lazily created: Azure Functions reuses a warm
// instance across invocations, so a connection is established once and then
// reused for the life of that instance.

import sql from 'mssql';

let poolPromise = null;

function connect(connectionString) {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(connectionString)
      .connect()
      .catch((e) => { poolPromise = null; throw e; });
  }
  return poolPromise;
}

/** `?` placeholders → named parameters, which is what the driver wants. */
function bindParams(request, params) {
  params.forEach((value, i) => {
    if (value === undefined) value = null;
    request.input(`p${i}`, value);
  });
}

function toNamed(text) {
  let i = 0;
  return text.replace(/\?/g, () => `@p${i++}`);
}

class Statement {
  constructor(pool, text) { this.pool = pool; this.text = toNamed(text); this.params = []; }

  bind(...params) { this.params = params; return this; }

  async #run() {
    const request = this.pool.request();
    bindParams(request, this.params);
    return request.query(this.text);
  }

  async first() {
    const result = await this.#run();
    return result.recordset?.[0] ?? null;
  }

  async all() {
    const result = await this.#run();
    return { results: result.recordset ?? [], success: true };
  }

  async run() {
    const result = await this.#run();
    return { success: true, meta: { changes: result.rowsAffected?.[0] ?? 0 } };
  }
}

export function makeDb(connectionString) {
  return {
    prepare(text) {
      return {
        bind: (...params) => {
          const held = { text, params };
          return {
            first: async () => new Statement(await connect(connectionString), held.text)
              .bind(...held.params).first(),
            all: async () => new Statement(await connect(connectionString), held.text)
              .bind(...held.params).all(),
            run: async () => new Statement(await connect(connectionString), held.text)
              .bind(...held.params).run(),
          };
        },
        first: async () => new Statement(await connect(connectionString), text).first(),
        all: async () => new Statement(await connect(connectionString), text).all(),
        run: async () => new Statement(await connect(connectionString), text).run(),
      };
    },

    /** Sequential rather than a real transaction — every caller here is idempotent. */
    async batch(statements) {
      const out = [];
      for (const s of statements) out.push(await s.run());
      return out;
    },
  };
}

/**
 * Rate limiting used to live in Cloudflare KV. Azure Static Web Apps' managed
 * Functions have no key-value binding, so it lives in a table with an expiry
 * column — the volume is a handful of rows a day.
 */
export function makeRateLimiter(db) {
  return {
    async get(key) {
      const row = await db.prepare(
        `SELECT counter FROM rate_limit WHERE rl_key = ? AND expires_at > ?`
      ).bind(key, Date.now()).first();
      return row ? String(row.counter) : null;
    },
    async put(key, value, { expirationTtl = 900 } = {}) {
      const expires = Date.now() + expirationTtl * 1000;
      await db.prepare(
        `MERGE rate_limit AS target
         USING (SELECT ? AS rl_key) AS source ON target.rl_key = source.rl_key
         WHEN MATCHED THEN UPDATE SET counter = ?, expires_at = ?
         WHEN NOT MATCHED THEN INSERT (rl_key, counter, expires_at) VALUES (?, ?, ?);`
      ).bind(key, Number(value), expires, key, Number(value), expires).run();
    },
    async delete(key) {
      await db.prepare(`DELETE FROM rate_limit WHERE rl_key = ?`).bind(key).run();
    },
  };
}

export { sql };
