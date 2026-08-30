// Azure OpenAI, used only for grading open concept answers against a rubric.
//
// Latency is the constraint: the voice agent is mid-conversation waiting for
// this, so the three samples run in parallel, max_tokens is capped hard, and the
// model is asked for a bare JSON object rather than prose. A reasoning model
// would be more accurate and far too slow — the grader's job is to check three
// key points against a transcript, not to think.

const TIMEOUT_MS = 4000;

export function makeChat({ endpoint, apiKey, deployment, apiVersion = '2026-02-01' }) {
  if (!endpoint || !apiKey || !deployment) {
    // No grader configured: every open answer defers rather than being marked
    // wrong. Losing a mark to a missing config would be the worst outcome here.
    return async () => { throw new Error('grader_not_configured'); };
  }

  const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}`
    + `/chat/completions?api-version=${apiVersion}`;

  return async function chat({ messages, temperature = 0.3, max_tokens = 300 }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          messages,
          temperature,
          max_tokens,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`grader ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? '';
    } finally {
      clearTimeout(timer);
    }
  };
}
