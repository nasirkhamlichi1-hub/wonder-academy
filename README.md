# The Wonder Academy

A homeschool learning app for three children, taught by a live voice teacher.

- **Sol**, 14, Year 10 — GCSE maths, English language, English literature, combined science, geography and business. 2 × 50 min a day.
- **Isaac**, 11, Year 7 — KS3 maths, English and science, plus geography, history and computing. 2 × 35 min a day.
- **Sophia**, 6, Year 2 — English, maths, science and a blended humanities strand. Untimed and playful.

The teacher is an ElevenLabs voice agent that runs the whole lesson in
conversation: it asks, waits, scaffolds when the child is stuck, and never hands
over an answer the child could reach with one more question. What the child gets
right and wrong feeds an FSRS-6 spaced-repetition schedule, so material comes
back at the point it is about to be forgotten rather than never again.

## Layout

```
site/           the built frontend (Static Web Apps app_location)
web/            frontend source — vanilla JS, see the note below
api/            Azure Functions (api_location)
  src/index.js    one catch-all HTTP function
  src/lib/        router, scheduling, grading, prompts, analytics
  curriculum/     year2.json, year7.json, year10.json — the full 2026/27 year
migrations/azure/ T-SQL schema
agent/          how to configure the ElevenLabs agent
scripts/        build, simulation, SQL lint, dev harness, headless UI test
test/           the rules that decide what a child is asked
```

### Why the frontend has no framework

The ElevenLabs React SDK has an open iOS Safari bug where `ConversationProvider`
breaks and client tools never fire. Client tools are how this app advances the
lesson and records every answer, so losing them on an iPad would take out the
whole product. The vanilla `@elevenlabs/client` path is the documented way round
it, and it is what this uses.

## Architecture

| | |
|---|---|
| Frontend + API | **Azure Static Web Apps (Free)** with managed Functions — one origin, so no CORS |
| Database | **Azure SQL Database, Basic 5 DTU, ~$4.90/mo** |
| Grading | **Azure OpenAI**, a small fast model, three samples in parallel |
| Nightly job | a scheduled **GitHub Actions** workflow POSTs `/api/rollup` |
| Secrets | Static Web Apps application settings — never in the repo, never in the browser |

**The database is deliberately not serverless.** Azure SQL serverless auto-pauses
when idle and takes about a minute to resume. This app is used in short daily
bursts with twelve-hour gaps, so every single session would open with a
one-minute stall. The Basic tier is provisioned and always on, and that is what
the £4-odd a month is buying. The free SQL offer cannot substitute: its 100,000
vCore-seconds a month is about 55 hours of un-paused database, so staying inside
it *requires* auto-pause.

Managed Functions have no timer trigger and no key-value store, which is why the
nightly rollup is an HTTP endpoint poked by Actions, and why rate limiting lives
in a table.

## Setup

### Once, by a human — about ten minutes in [Azure Cloud Shell](https://shell.azure.com)

```bash
SUB=$(az account show --query id -o tsv)
TENANT=$(az account show --query tenantId -o tsv)
REPO="nasirkhamlichi1-hub/wonder-academy"

APP_ID=$(az ad app create --display-name "gh-wonder-academy" --query appId -o tsv)
az ad sp create --id "$APP_ID"
az ad app federated-credential create --id "$APP_ID" --parameters "{
  \"name\": \"gh-main\",
  \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"repo:${REPO}:ref:refs/heads/main\",
  \"audiences\": [\"api://AzureADTokenExchange\"]
}"
az role assignment create --role Contributor --assignee "$APP_ID" --scope "/subscriptions/${SUB}"

echo "AZURE_CLIENT_ID=$APP_ID"; echo "AZURE_TENANT_ID=$TENANT"; echo "AZURE_SUBSCRIPTION_ID=$SUB"
```

Cloud Shell is used rather than a local `az` because it authenticates from the
browser session — nothing has to reach `login.microsoftonline.com` from a
developer machine.

### GitHub repository secrets

| Secret | What |
|---|---|
| `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` | from the script above |
| `SQL_ADMIN_PASSWORD` | generate a long one |
| `PIN_PEPPER` | `openssl rand -hex 32` — **never change it once the children have logged in** |
| `COACH_API_KEY`, `ROLLUP_SECRET` | `openssl rand -hex 32` each |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_WEBHOOK_SECRET` | from ElevenLabs — see `agent/README.md` |

### Then

1. Actions → **Provision Azure infrastructure** → Run workflow. It creates the
   resource group, SQL server and database, applies the schema, creates the
   Static Web App and the Azure OpenAI deployment, and pushes every secret into
   application settings. The run summary prints the site hostname and the one
   command needed for the deployment token.
2. Add the repository variable `SWA_HOSTNAME` and the secret
   `AZURE_STATIC_WEB_APPS_API_TOKEN` that the summary asks for.
3. Actions → **Deploy**.
4. Create the children and load the curriculum:

```bash
API=https://<hostname>
curl -X POST $API/api/admin/bootstrap -H "Authorization: Bearer $COACH_API_KEY" \
  -H 'content-type: application/json' -d @scripts/children.json    # edit the PINs first
curl -X POST $API/api/admin/load-components -H "Authorization: Bearer $COACH_API_KEY" \
  -H 'content-type: application/json' -d '{}'
```

## The daily rates, and where they come from

`scripts/simulate.mjs` runs a 190-day school year against the real curriculum,
drawing each response from FSRS's own predicted recall probability so the lapse
rate is self-consistent. It is what set these numbers, not intuition:

| | retention | new items/day | review budget/day | year-end coverage | mature at year end |
|---|---|---|---|---|---|
| Sol | 0.90 | 17 | 48 min | 100% | 91% |
| Isaac | 0.85 | 12 | 31 min | 100% | 85% |
| Sophia | 0.85 | 5 | 10 min | 64% | 79% |

Sophia is deliberately not scheduled to cover her whole scheme. Reaching 100%
would mean fifteen minutes of daily drilling for a six-year-old, which is the
opposite of stopping while she still wants more. The rest waits for Year 3.

Sol's is the tight one: six GCSEs including double science is a full school
day's content, and he has a hundred minutes. Forty of those go on review, which
leaves about sixty for new teaching of seventeen components. It works on paper.
Watch how he actually copes in week three.

Re-run after any change to the curriculum or the rates:

```bash
node scripts/simulate.mjs      # coverage and load for the year
node scripts/scenarios.mjs     # the coverage/retention trade-offs
```

## Things that are deliberate

- **The child never rates their own recall.** The grade is derived from whether
  they were right, how much help they needed, and how long they took. Any
  scaffold caps the rating at Hard; being told the answer is Again.
- **A grader that cannot reach a verdict never costs a mark.** It logs the answer
  for the parent to look at and the lesson carries on.
- **A mis-heard answer gets a clarifying question, not a cross.** The re-answer
  is graded as unaided — asking someone to repeat themselves is not a hint.
- **No transcript of the teacher on screen.** Identical narration as both speech
  and text makes learning worse. Terms appear on screen; sentences do not.
- **No streaks, XP, badges, or minutes-studied.** They measure compliance. The
  headline number is delayed accuracy on 14-day-old material, and nothing at all
  is shown to the child.
- **The child never sees a backlog count.** Sessions end on time whatever the
  queue looks like.

## Tests

```bash
npm test                    # the rules, plus the SQL lint
node scripts/sqllint.mjs    # every statement parses as T-SQL and binds correctly
node scripts/simulate.mjs   # year-long load model
npm run dev                 # frontend harness on :8787
node scripts/uitest.mjs     # headless run through login → dashboard
```

There is no SQL Server to test against locally, so `sqllint.mjs` does the work a
integration test would: it parses all 68 statements as T-SQL and checks that each
one binds exactly as many values as it has placeholders. A mismatched parameter
list in a hand-written `MERGE` is precisely the bug that would otherwise surface
with a child mid-lesson.
