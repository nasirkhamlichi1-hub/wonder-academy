// Subject marks.
//
// Bitesize uses commissioned spot illustrations. We can't, so these are
// geometric emblems instead — drawn on one 24-unit grid, one stroke weight, so
// six of them sitting in a row read as one family rather than six clip-arts.
// Each is used twice on a tile: small and solid in the corner, and huge and
// faint behind the name, which is what gives the tiles their depth.

const S = (body, opts = {}) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${opts.w || 1.7}"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"
        class="icon${opts.cls ? ` ${opts.cls}` : ''}">${body}</svg>`;

export const ICONS = {
  // Four operators on a quadrant — the one mark everybody reads as "maths".
  maths: () => S(`
    <path d="M3.5 6.2h4M5.5 4.2v4"/>
    <path d="M16.5 4.4l4 4M20.5 4.4l-4 4"/>
    <path d="M3.5 17.6h4"/>
    <path d="M16.5 17.6h4"/><circle cx="18.5" cy="14.9" r=".85" fill="currentColor" stroke="none"/>
    <circle cx="18.5" cy="20.3" r=".85" fill="currentColor" stroke="none"/>
    <path d="M12 2.6v18.8" opacity=".35"/><path d="M2.6 12h18.8" opacity=".35"/>`),

  // An open book, spine centred.
  english: () => S(`
    <path d="M12 6.6C10.3 5.2 8.2 4.5 5.4 4.5c-.6 0-1 .4-1 1v11.6c0 .6.4 1 1 1 2.8 0 4.9.7 6.6 2.1"/>
    <path d="M12 6.6c1.7-1.4 3.8-2.1 6.6-2.1.6 0 1 .4 1 1v11.6c0 .6-.4 1-1 1-2.8 0-4.9.7-6.6 2.1"/>
    <path d="M12 6.6v13.6"/>`),

  // Two opening quotation marks — literature, told apart from language at a
  // glance while staying the same family colour.
  literature: () => S(`
    <path d="M10.2 5.2c-3 1.1-4.9 3.6-4.9 6.9v6.7h6.4v-6.7H8.1c0-2.1.9-3.6 2.7-4.4z"
          fill="currentColor" stroke="none"/>
    <path d="M19.2 5.2c-3 1.1-4.9 3.6-4.9 6.9v6.7h6.4v-6.7h-3.6c0-2.1.9-3.6 2.7-4.4z"
          fill="currentColor" stroke="none"/>`),

  // Flask, with what is happening inside it.
  science: () => S(`
    <path d="M9.6 3.2h4.8M10.4 3.2v6L5.7 17.7A2 2 0 0 0 7.4 20.8h9.2a2 2 0 0 0 1.7-3.1L13.6 9.2v-6"/>
    <path d="M7.9 14.4h8.2"/>
    <circle cx="10.6" cy="17.2" r="1.05" fill="currentColor" stroke="none"/>
    <circle cx="13.9" cy="18.1" r=".75" fill="currentColor" stroke="none"/>`),

  geography: () => S(`
    <circle cx="12" cy="12" r="8.6"/>
    <path d="M3.4 12h17.2"/>
    <path d="M12 3.4c2.3 2.4 3.5 5.4 3.5 8.6s-1.2 6.2-3.5 8.6c-2.3-2.4-3.5-5.4-3.5-8.6S9.7 5.8 12 3.4Z"/>`),

  // Hourglass — time, which is what history is.
  history: () => S(`
    <path d="M6.6 3.4h10.8M6.6 20.6h10.8"/>
    <path d="M7.8 3.4v3.1c0 1.4.6 2.7 1.7 3.6L12 12l-2.5 1.9a4.6 4.6 0 0 0-1.7 3.6v3.1"/>
    <path d="M16.2 3.4v3.1c0 1.4-.6 2.7-1.7 3.6L12 12l2.5 1.9c1.1.9 1.7 2.2 1.7 3.6v3.1"/>
    <path d="M9.6 18.4h4.8" opacity=".55"/>`),

  computing: () => S(`
    <rect x="7.2" y="7.2" width="9.6" height="9.6" rx="2"/>
    <path d="M10.2 3.6v3.6M13.8 3.6v3.6M10.2 16.8v3.6M13.8 16.8v3.6"/>
    <path d="M3.6 10.2h3.6M3.6 13.8h3.6M16.8 10.2h3.6M16.8 13.8h3.6"/>
    <path d="M10.6 11.1h2.8v2.8h-2.8z" fill="currentColor" stroke="none" opacity=".75"/>`),

  business: () => S(`
    <path d="M3.6 20.4h16.8"/>
    <rect x="5" y="12.4" width="3.4" height="8" rx="1"/>
    <rect x="10.3" y="8.6" width="3.4" height="11.8" rx="1"/>
    <rect x="15.6" y="4.6" width="3.4" height="15.8" rx="1"/>`),

  // A compass rose: the subject that is everything at once.
  discover: () => S(`
    <circle cx="12" cy="12" r="8.6"/>
    <path d="M15.4 8.6 13.7 13.7 8.6 15.4l1.7-5.1z" fill="currentColor" stroke="none" opacity=".8"/>
    <path d="M12 1.8v2.2M12 20v2.2M1.8 12H4M20 12h2.2"/>`),

  dt: () => S(`
    <path d="M14.6 3.6a4.4 4.4 0 0 0-1.2 7.3l-9 9a1.7 1.7 0 0 0 2.4 2.4l9-9a4.4 4.4 0 0 0 5.1-6.4l-2.7 2.7-2.6-.7-.7-2.6z"/>`),

  // fallbacks
  default: () => S(`<circle cx="12" cy="12" r="8.6"/><path d="M12 7.6v6M12 16.4h.01"/>`),
};

export const icon = (key) => (ICONS[key] || ICONS.default)();

/** UI marks, used in buttons and status. */
export const UI = {
  play: () => S(`<path d="M7.5 4.9 19 12 7.5 19.1z" fill="currentColor" stroke="none"/>`),
  mic: () => S(`<rect x="9" y="2.6" width="6" height="11" rx="3"/>
                <path d="M5.4 11.4a6.6 6.6 0 0 0 13.2 0M12 18v3.4"/>`),
  check: () => S(`<path d="m4.8 12.6 4.6 4.6 9.8-10.4"/>`, { w: 2.2 }),
  arrow: () => S(`<path d="M4.5 12h15M13.4 6l6 6-6 6"/>`),
  spark: () => S(`<path d="M12 2.6 14 9.4l6.8 2-6.8 2-2 6.8-2-6.8-6.8-2 6.8-2z"
                        fill="currentColor" stroke="none"/>`),
  lock: () => S(`<rect x="4.6" y="10.2" width="14.8" height="10.6" rx="2.4"/>
                 <path d="M8.4 10.2V7.4a3.6 3.6 0 0 1 7.2 0v2.8"/>`),
  back: () => S(`<path d="M19.5 12h-15M10.6 6l-6 6 6 6"/>`),
};
