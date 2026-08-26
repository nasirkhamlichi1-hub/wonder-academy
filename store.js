/* Wonder Academy — local data store.
   Everything lives in this browser only (localStorage). Nothing is uploaded. */

const STORE_KEY = 'wonderAcademy.v1';

const Store = {
  _data: null,

  _blank() {
    return { version: 1, children: [], createdAt: new Date().toISOString() };
  },

  load() {
    if (this._data) return this._data;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      this._data = raw ? JSON.parse(raw) : this._blank();
    } catch (e) {
      console.warn('Wonder Academy: could not read saved data, starting fresh.', e);
      this._data = this._blank();
    }
    if (!Array.isArray(this._data.children)) this._data.children = [];
    return this._data;
  },

  save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this._data));
      return true;
    } catch (e) {
      console.warn('Wonder Academy: could not save progress.', e);
      return false;
    }
  },

  children() { return this.load().children; },

  child(id) { return this.children().find(c => c.id === id) || null; },

  addChild({ name, year, avatar, colour, pin }) {
    const c = {
      id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name.trim(), year: Number(year), avatar, colour,
      pin: String(pin || '').trim(),
      xp: 0, streak: 0, lastActiveDay: null,
      mastery: {},          // skillId -> { attempts, bestPct, level, lastPct }
      history: []           // { day, subject, skillId, skillName, score, total, tier }
    };
    this.children().push(c);
    this.save();
    return c;
  },

  updateChild(id, patch) {
    const c = this.child(id);
    if (!c) return null;
    Object.assign(c, patch);
    if (patch.year !== undefined) c.year = Number(patch.year);
    this.save();
    return c;
  },

  removeChild(id) {
    const d = this.load();
    d.children = d.children.filter(c => c.id !== id);
    this.save();
  },

  today() { return new Date().toISOString().slice(0, 10); },

  /* Record a finished quiz and return { xpGained, levelUp, newLevel } */
  recordResult(id, { subject, skillId, skillName, score, total, tier }) {
    const c = this.child(id);
    if (!c) return null;
    const pct = total ? Math.round((score / total) * 100) : 0;
    const mult = tier === 'recap' ? 6 : tier === 'stretch' ? 14 : 10;
    const xpGained = score * mult + (pct === 100 ? 25 : 0);

    const m = c.mastery[skillId] || { attempts: 0, bestPct: 0, level: 0, lastPct: 0, secureRuns: 0 };
    m.attempts += 1;
    m.lastPct = pct;
    m.bestPct = Math.max(m.bestPct, pct);
    if (pct >= 90) m.secureRuns = (m.secureRuns || 0) + 1;
    m.level = m.secureRuns >= 2 && m.bestPct >= 90 ? 3 : m.bestPct >= 70 ? 2 : 1;
    c.mastery[skillId] = m;

    const day = this.today();
    if (c.lastActiveDay !== day) {
      const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      c.streak = c.lastActiveDay === yesterday ? (c.streak || 0) + 1 : 1;
      c.lastActiveDay = day;
    }

    const beforeLevel = Store.levelFor(c.xp).n;
    c.xp += xpGained;
    const after = Store.levelFor(c.xp);
    c.history.unshift({ day, subject, skillId, skillName, score, total, pct, tier, xp: xpGained });
    c.history = c.history.slice(0, 60);
    this.save();
    return { xpGained, levelUp: after.n > beforeLevel, newLevel: after, pct, mastery: m };
  },

  LEVELS: [
    { n: 1, at: 0, title: 'Explorer' },
    { n: 2, at: 250, title: 'Apprentice' },
    { n: 3, at: 700, title: 'Scholar' },
    { n: 4, at: 1500, title: 'Investigator' },
    { n: 5, at: 2800, title: 'Expert' },
    { n: 6, at: 4600, title: 'Master' },
    { n: 7, at: 7000, title: 'Sage' },
    { n: 8, at: 10000, title: 'Luminary' }
  ],

  levelFor(xp) {
    let cur = this.LEVELS[0];
    for (const l of this.LEVELS) if (xp >= l.at) cur = l;
    const next = this.LEVELS.find(l => l.at > xp) || null;
    const span = next ? next.at - cur.at : 1;
    const into = next ? xp - cur.at : 1;
    return { ...cur, next, progress: next ? Math.min(1, into / span) : 1 };
  },

  exportAll() { return JSON.stringify(this.load(), null, 2); },

  importAll(json) {
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.children)) throw new Error('That file does not look like a Wonder Academy backup.');
    this._data = parsed;
    this.save();
  },

  resetAll() { this._data = this._blank(); this.save(); }
};
