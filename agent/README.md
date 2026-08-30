# The ElevenLabs agent

One agent serves all three children. Everything that varies per lesson arrives as
a prompt override and dynamic variables from the Worker, so this configuration is
set once and then left alone.

## Create it

ElevenLabs dashboard → Agents → Create agent → Blank.

**Name:** Wonder Academy Teacher

**First message:** leave blank — the Worker overrides it per lesson.

**System prompt:** paste the contents of `base-prompt.txt`. The per-lesson prompt
replaces this at conversation start; this is the fallback if an override ever
fails to apply.

## Settings that matter

| Setting | Value | Why |
|---|---|---|
| **LLM** | Claude Sonnet 4.5, GPT-5, or Gemini 2.5 Flash | Tool calling has to be reliable — `submit_answer` firing on every answer is how the whole memory system gets fed. Do not use a nano/lite model here. |
| **Max conversation duration** | **3600 s** | The default is 600 s and will cut a fifty-minute lesson off a fifth of the way in. This is the single most important setting on this page. |
| **Turn eagerness** | **Patient** | Children pause mid-sentence far more than adults. On Normal the agent talks over a thinking child constantly. |
| **Take turn after silence** | 4 s (5 s if you make a separate agent for Lily) | Wait time. Extending from 1 s to 3+ s measurably increases how much a child says. |
| **Soft timeout** | disabled (-1) | A filler noise while the model thinks trains the child to expect the agent to fill silence. We want the opposite. |
| **Interruptions** | enabled | A child correcting themselves mid-answer must be able to. |
| **Temperature** | 0.4 | |
| **Authentication** | **require authorisation** | The Worker mints per-child tokens. Do **not** also set a hostname allowlist — ElevenLabs' own guidance is to use one mechanism, not both. |

## Overrides — must be enabled or the lesson prompt silently does nothing

Security → Overrides, enable **only**:

- System prompt
- First message
- Language

Nothing else. Every enabled override is a surface that anyone who reaches the
token endpoint can set.

## Client tools

Add each of these with **Wait for response** ticked. Parameter names are
case-sensitive and must match exactly.

| Tool | Parameters | Description to give it |
|---|---|---|
| `submit_answer` | `component_id` (string, required), `answer` (string, required), `scaffold_level` (number, required), `expected` (string), `pretest` (boolean) | Report the child's answer after every single question. scaffold_level is how much help you had given by the time they got it: 0 unaided, 1 you re-voiced or narrowed, 2 you asked a sub-question, 3 you gave a hint, 4 you did a step, 5+ you told them. Set pretest true only for questions asked before teaching. |
| `next_phase` | — | Call when you have finished the current phase of the session. |
| `show_term` | `word` (string, required), `definition` (string) | Put a word on the screen as you say it. Use for every new technical term, and for anything a young child needs to see spelled. |
| `show_reading` | — | Bring the reading up on screen. Then go quiet and let them read. |
| `show_diagram` | `diagram_id` (string) | Show a diagram. |
| `log_wonder` | `question` (string, required) | Call whenever the child asks a question of their own that you did not prompt. |
| `get_progress` | — | Where you are in the session. |

Also enable the built-in system tool **`skip_turn`** — it is what lets the agent
deliberately stay quiet while a child works a problem out, instead of filling the
silence. It is also the cheapest thing on this page: silence over ten seconds
bills at a 95% discount.

## Post-call analysis

Analysis → Evaluation criteria:

- `stayed_on_topic` — Did the conversation stay on the lesson and remain
  appropriate for a child of this age?
- `child_explained_unaided` — Did the child explain at least one idea in their
  own words without being led to it?
- `agent_avoided_giving_answers` — Did the teacher hold back the answer and
  scaffold instead?

Analysis → Data collection:

- `unprompted_question` (string) — any question the child asked of their own
  accord.
- `misconceptions_observed` (string) — misconceptions the child showed.
- `frustration_signals` (string) — signs the child was struggling affectively
  rather than cognitively.
- `suggested_next_lesson` (string) — what you would teach next, and why.

## Post-call webhook

Workspace → Webhooks → add `https://<your-worker>/api/voice/webhook`, type
**transcription**. Copy the signing secret into the Worker:

```
wrangler secret put ELEVENLABS_WEBHOOK_SECRET
```

## Voice

Pick something warm, unhurried and adult. Set speed slightly below 1.0 — the
register depends on pauses, and a rushed delivery destroys it. Avoid anything
bright or performatively enthusiastic; the wonder is supposed to come from the
content.
