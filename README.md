# Wonder Academy

A small learning site for one family. Each child gets their own profile and PIN, then works
through a three-tier ladder in Maths, English and Science:

- **Recap** — last year's programme of study, to keep it sharp
- **This year** — the current year group's core objectives
- **Next year** — a stretch tier that unlocks once half of this year's topics are secure

Curriculum follows the England National Curriculum, Years 1–9 (KS1 through KS3).

## How it works

- **Maths** questions are generated on the fly, scaled to the year group, so a topic never runs out.
- **English and Science** use curated question banks with an explanation shown after every answer.
- **Mastery** per topic: *started* → *secure* (best score ≥ 70%) → *mastered* (≥ 90% twice).
- **Progress** — XP, levels, day streaks and a per-topic history.

## Privacy

There is no backend and no account. Everything is stored in the browser's `localStorage`
on the device it was used on. Nothing is uploaded anywhere. The PIN keeps siblings out of
each other's progress — it is not security.

Use **Parent area → Download backup** to save a JSON file, and **Restore backup** to move
progress to another device or browser.

## Running it

It is a static site with no build step.

- Live: served from GitHub Pages on the `main` branch, root folder.
- Locally: `python3 -m http.server` in this folder, then open the address it prints.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell and script loading order |
| `styles.css` | All styling, light and dark |
| `curriculum.js` | Year/subject map and the Maths skill list |
| `content-english.js` | English question banks, Years 1–9 |
| `content-science.js` | Science question banks, Years 1–9 |
| `generators.js` | Maths question generators |
| `store.js` | Profiles, mastery, XP and levels in `localStorage` |
| `app.js` | Screens, quiz engine and answer checking |

## Changing the curriculum

Add a topic by appending to the relevant year's array. Maths topics need a `gen` naming a
generator in `generators.js`; English and Science topics carry their own `items` array where
`a` is the index of the correct option (options are shuffled at runtime).
