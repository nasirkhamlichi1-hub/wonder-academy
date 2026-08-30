// Azure Functions entry point.
//
// One catch-all HTTP function fronts the whole API. Static Web Apps routes
// everything under /api here, so the browser talks to a single origin and there
// is no CORS to get wrong.

import { app } from '@azure/functions';
import { makeDb, makeRateLimiter } from './lib/db.js';
import { makeChat } from './lib/ai.js';
import { readCurriculum } from './lib/assets.js';
import { handleApi } from './lib/router.js';

/**
 * The environment object the router expects. Built once per warm instance —
 * the SQL pool inside makeDb is what we most want to keep alive between calls.
 */
let env = null;

function getEnv() {
  if (env) return env;

  const db = makeDb(process.env.SQL_CONNECTION_STRING);
  env = {
    DB: db,
    RATE: makeRateLimiter(db),
    readCurriculum,
    chat: makeChat({
      endpoint: process.env.AOAI_ENDPOINT,
      apiKey: process.env.AOAI_KEY,
      deployment: process.env.AOAI_DEPLOYMENT,
      apiVersion: process.env.AOAI_API_VERSION,
    }),
    PIN_PEPPER: process.env.PIN_PEPPER,
    COACH_API_KEY: process.env.COACH_API_KEY,
    ROLLUP_SECRET: process.env.ROLLUP_SECRET,
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    ELEVENLABS_AGENT_ID: process.env.ELEVENLABS_AGENT_ID,
    ELEVENLABS_WEBHOOK_SECRET: process.env.ELEVENLABS_WEBHOOK_SECRET,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '',
    APP_VERSION: process.env.APP_VERSION || '2.0.0',
  };
  return env;
}

app.http('api', {
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  authLevel: 'anonymous',
  route: '{*path}',
  handler: async (request, context) => {
    // Azure's HttpRequest is close to a fetch Request but not identical, so
    // normalise once rather than teaching the router two shapes.
    const body = ['GET', 'HEAD'].includes(request.method)
      ? undefined
      : await request.text();

    const standard = new Request(request.url, {
      method: request.method,
      headers: new Headers(Object.fromEntries(request.headers.entries())),
      body: body || undefined,
    });

    const res = await handleApi(standard, getEnv());
    return {
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body: await res.text(),
    };
  },
});
