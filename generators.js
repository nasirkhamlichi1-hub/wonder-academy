/* Wonder Academy — maths question generators.
   Every generator takes a year (1–9) and returns:
     { q, kind: 'input' | 'choice', answer, options?, why }
   Answers are compared as normalised strings. */

const R = {
  int: (a, b) => Math.floor(Math.random() * (b - a + 1)) + a,
  pick: arr => arr[Math.floor(Math.random() * arr.length)],
  shuffle: arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
  gcd: (a, b) => (b ? R.gcd(b, a % b) : Math.abs(a)),
  // Build a choice question with distractors, de-duplicated.
  choice: (q, answer, distractors, why) => {
    const seen = new Set([String(answer)]);
    const opts = [String(answer)];
    for (const d of distractors) {
      const s = String(d);
      if (!seen.has(s) && opts.length < 4) { seen.add(s); opts.push(s); }
    }
    return { q, kind: 'choice', answer: String(answer), options: opts, why };
  },
  input: (q, answer, why) => ({ q, kind: 'input', answer: String(answer), why })
};

function fracStr(n, d) { return n + '/' + d; }
function simplify(n, d) { const g = R.gcd(n, d) || 1; return [n / g, d / g]; }

const GEN = {

  /* ------------------------------------------------ number & place value -- */
  placeValue(y) {
    const max = { 1: 100, 2: 100, 3: 1000, 4: 10000, 5: 1000000, 6: 10000000 }[Math.min(y, 6)] || 10000000;
    const n = R.int(Math.floor(max / 10), max - 1);
    const mode = R.pick(['digit', 'round', 'compare', 'words', 'partition']);
    if (mode === 'digit') {
      const places = ['ones', 'tens', 'hundreds', 'thousands', 'ten thousands', 'hundred thousands', 'millions'];
      const s = String(n);
      const idx = R.int(0, Math.min(s.length - 1, places.length - 1));
      const digit = Number(s[s.length - 1 - idx]);
      return R.input(`What is the value of the ${places[idx]} digit in ${n.toLocaleString('en-GB')}?`,
        digit * Math.pow(10, idx),
        `The digit is ${digit} and it sits in the ${places[idx]} column, so its value is ${digit} × ${Math.pow(10, idx).toLocaleString('en-GB')}.`);
    }
    if (mode === 'round') {
      const to = R.pick(y <= 3 ? [10, 100] : y <= 4 ? [10, 100, 1000] : [10, 100, 1000, 10000]);
      const ans = Math.round(n / to) * to;
      return R.input(`Round ${n.toLocaleString('en-GB')} to the nearest ${to.toLocaleString('en-GB')}.`, ans,
        `Look at the digit to the right of the ${to.toLocaleString('en-GB')} column: 5 or more rounds up.`);
    }
    if (mode === 'compare') {
      const m = n + R.pick([-1, 1]) * R.int(1, Math.max(2, Math.floor(max / 20)));
      const ans = n > m ? '>' : '<';
      return R.choice(`Which symbol goes here?   ${n.toLocaleString('en-GB')}  ?  ${m.toLocaleString('en-GB')}`,
        ans, ['<', '>', '='], 'The wide end of the symbol faces the larger number.');
    }
    if (mode === 'partition') {
      const s = String(n);
      const parts = s.split('').map((d, i) => Number(d) * Math.pow(10, s.length - 1 - i)).filter(v => v > 0);
      return R.input(`${parts.join(' + ')} = ?`, n, 'Add the parts back together to rebuild the number.');
    }
    if (y <= 3) {
      const map = { 'thirty-one': 31, 'forty-five': 45, 'sixty-two': 62, 'seventy-eight': 78, 'eighty-nine': 89 };
      const w = R.pick(Object.keys(map));
      return R.input(`Write "${w}" in numerals.`, map[w], `${w} = ${map[w]}.`);
    }
    // Older years: read a large number written in words back as digits.
    const units = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const tens = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const th = R.int(1, 9), hu = R.int(1, 9), te = R.int(2, 9);
    const val = th * 1000 + hu * 100 + te * 10;
    return R.input(`Write "${units[th - 1]} thousand, ${units[hu - 1]} hundred and ${tens[te - 2]}" in numerals.`,
      val, `${th} thousands + ${hu} hundreds + ${te} tens = ${val}.`);
  },

  /* ------------------------------------------------- addition/subtraction -- */
  addSub(y) {
    if (y >= 6 && Math.random() < 0.5) {
      // order of operations
      const a = R.int(2, 9), b = R.int(2, 9), c = R.int(2, 9);
      const forms = [
        { q: `${a} + ${b} × ${c}`, v: a + b * c, w: 'Multiply before you add (BIDMAS).' },
        { q: `(${a} + ${b}) × ${c}`, v: (a + b) * c, w: 'Brackets first, then multiply.' },
        { q: `${a * c} ÷ ${c} + ${b}`, v: a + b, w: 'Divide before you add.' },
        { q: `${a} × ${b} - ${c}`, v: a * b - c, w: 'Multiply first, then subtract.' }
      ];
      const f = R.pick(forms);
      return R.input(`Work out:  ${f.q}`, f.v, f.w);
    }
    const cap = { 1: 20, 2: 100, 3: 999, 4: 9999, 5: 99999, 6: 999999 }[Math.min(y, 6)] || 999999;
    const lo = y === 1 ? 1 : Math.floor(cap / 10);
    const a = R.int(lo, cap), b = R.int(lo, Math.min(a, cap));
    if (Math.random() < 0.5) {
      return R.input(`${a.toLocaleString('en-GB')} + ${b.toLocaleString('en-GB')} = ?`, a + b,
        'Line up the columns and add from the ones, carrying where needed.');
    }
    return R.input(`${a.toLocaleString('en-GB')} − ${b.toLocaleString('en-GB')} = ?`, a - b,
      'Line up the columns and subtract from the ones, exchanging where needed.');
  },

  /* ------------------------------------------------------- times tables --- */
  timesTables(y) {
    const tables = { 2: [2, 5, 10], 3: [3, 4, 8, 2, 5, 10] }[y] || [2, 3, 4, 5, 6, 7, 8, 9, 11, 12];
    const t = R.pick(tables), n = R.int(2, 12);
    if (Math.random() < 0.6) {
      return R.input(`${t} × ${n} = ?`, t * n, `${t} × ${n} = ${t * n}. Try counting on in ${t}s if you get stuck.`);
    }
    return R.input(`${t * n} ÷ ${t} = ?`, n, `Division undoes multiplication: ${t} × ${n} = ${t * n}.`);
  },

  /* ------------------------------------------- multiplication & division -- */
  mulDiv(y) {
    if (y <= 2) {
      const a = R.int(2, 10);
      if (Math.random() < 0.5) return R.input(`Double ${a} = ?`, a * 2, `Double means add it to itself: ${a} + ${a}.`);
      const e = R.int(1, 10) * 2;
      return R.input(`Half of ${e} = ?`, e / 2, `Halving is sharing into two equal groups.`);
    }
    if (y >= 5) {
      if (Math.random() < 0.5) {
        const a = R.int(112, 9999), b = R.int(11, 49);
        return R.input(`${a} × ${b} = ?`, a * b, 'Use long multiplication: multiply by the ones, then the tens, then add.');
      }
      const b = R.int(11, 39), q = R.int(12, 220), r = R.int(0, b - 1);
      const total = b * q + r;
      if (r === 0) return R.input(`${total} ÷ ${b} = ?`, q, 'Use long division — how many lots of the divisor fit each time?');
      return R.input(`${total} ÷ ${b} = ?  (give the answer as "quotient r remainder")`, `${q} r ${r}`,
        `${b} × ${q} = ${b * q}, and ${total} − ${b * q} = ${r}.`);
    }
    const a = R.int(12, 99), b = R.int(2, 9);
    if (Math.random() < 0.5) return R.input(`${a} × ${b} = ?`, a * b, 'Partition the two-digit number, multiply each part, then add.');
    return R.input(`${a * b} ÷ ${b} = ?`, a, `Division undoes multiplication: ${a} × ${b} = ${a * b}.`);
  },

  /* --------------------------------------------------------- fractions ---- */
  fractions(y) {
    if (y <= 2) {
      const amount = R.pick([4, 6, 8, 10, 12, 16, 20]);
      const half = Math.random() < 0.5;
      const d = half ? 2 : 4;
      if (amount % d !== 0) return GEN.fractions(y);
      return R.input(`What is ${half ? '1/2' : '1/4'} of ${amount}?`, amount / d,
        `Share ${amount} equally into ${d} groups.`);
    }
    if (y <= 4) {
      const mode = R.pick(['ofAmount', 'equivalent', 'compare']);
      if (mode === 'ofAmount') {
        const d = R.pick([3, 4, 5, 6, 8, 10]), n = R.int(1, d - 1), mult = R.int(2, 12);
        return R.input(`What is ${fracStr(n, d)} of ${d * mult}?`, n * mult,
          `Divide by ${d} to find one part (${mult}), then multiply by ${n}.`);
      }
      if (mode === 'equivalent') {
        const d = R.pick([2, 3, 4, 5]), n = R.int(1, d - 1), k = R.int(2, 5);
        return R.input(`Complete the equivalent fraction:  ${fracStr(n, d)} = ?/${d * k}`, n * k,
          `The denominator was multiplied by ${k}, so multiply the numerator by ${k} too.`);
      }
      const d = R.pick([5, 6, 7, 8, 9]);
      const n1 = R.int(1, d - 1); let n2 = R.int(1, d - 1);
      if (n2 === n1) n2 = n1 === 1 ? 2 : n1 - 1;
      return R.choice(`Which is larger:  ${fracStr(n1, d)}  or  ${fracStr(n2, d)}?`,
        n1 > n2 ? fracStr(n1, d) : fracStr(n2, d), [fracStr(n1, d), fracStr(n2, d)],
        'With the same denominator, the bigger numerator is the bigger fraction.');
    }
    // Year 5+: calculate with fractions
    const op = R.pick(['add', 'sub', 'mul', 'divInt', 'simplify']);
    const d1 = R.pick([2, 3, 4, 5, 6, 8, 10, 12]);
    const d2 = R.pick([2, 3, 4, 5, 6, 8, 10, 12]);
    const n1 = R.int(1, d1 - 1), n2 = R.int(1, d2 - 1);
    if (op === 'add' || op === 'sub') {
      const lcd = (d1 * d2) / R.gcd(d1, d2);
      const a = n1 * (lcd / d1), b = n2 * (lcd / d2);
      const num = op === 'add' ? a + b : a - b;
      if (op === 'sub' && num <= 0) return GEN.fractions(y);
      const [sn, sd] = simplify(num, lcd);
      return R.input(`${fracStr(n1, d1)} ${op === 'add' ? '+' : '−'} ${fracStr(n2, d2)} = ?  (simplest form, e.g. 3/4)`,
        sd === 1 ? String(sn) : fracStr(sn, sd),
        `Use a common denominator of ${lcd}, then ${op === 'add' ? 'add' : 'subtract'} the numerators and simplify.`);
    }
    if (op === 'mul') {
      const [sn, sd] = simplify(n1 * n2, d1 * d2);
      return R.input(`${fracStr(n1, d1)} × ${fracStr(n2, d2)} = ?  (simplest form)`,
        sd === 1 ? String(sn) : fracStr(sn, sd),
        'Multiply the numerators, multiply the denominators, then simplify.');
    }
    if (op === 'divInt') {
      const k = R.int(2, 6);
      const [sn, sd] = simplify(n1, d1 * k);
      return R.input(`${fracStr(n1, d1)} ÷ ${k} = ?  (simplest form)`,
        sd === 1 ? String(sn) : fracStr(sn, sd),
        `Dividing by ${k} is the same as multiplying the denominator by ${k}.`);
    }
    const k = R.int(2, 6);
    const [sn, sd] = simplify(n1 * k, d1 * k);
    return R.input(`Simplify ${fracStr(n1 * k, d1 * k)}.`, fracStr(sn, sd),
      `Divide the top and bottom by their highest common factor, ${R.gcd(n1 * k, d1 * k)}.`);
  },

  /* --------------------------------------------- decimals and percentages -- */
  decimalsPercents(y) {
    const mode = y >= 8 ? R.pick(['ofAmount', 'convert', 'change', 'interest', 'reverse'])
      : R.pick(['ofAmount', 'convert', 'ofAmount', 'change']);
    if (mode === 'convert') {
      const pairs = [[10, '0.1', '1/10'], [25, '0.25', '1/4'], [50, '0.5', '1/2'], [75, '0.75', '3/4'],
      [20, '0.2', '1/5'], [5, '0.05', '1/20'], [80, '0.8', '4/5'], [40, '0.4', '2/5']];
      const p = R.pick(pairs);
      if (Math.random() < 0.5) {
        return R.input(`Write ${p[0]}% as a decimal.`, p[1], `Divide by 100: ${p[0]} ÷ 100 = ${p[1]}.`);
      }
      return R.input(`Write ${p[0]}% as a fraction in its simplest form.`, p[2], `${p[0]}/100 simplifies to ${p[2]}.`);
    }
    if (mode === 'ofAmount') {
      const pct = R.pick([5, 10, 15, 20, 25, 30, 40, 50, 60, 75]);
      const amt = R.int(2, 40) * 20;
      return R.input(`What is ${pct}% of ${amt}?`, (pct / 100) * amt,
        `10% of ${amt} is ${amt / 10}, so ${pct}% is ${pct / 10} lots of that.`);
    }
    if (mode === 'change') {
      const pct = R.pick([10, 20, 25, 5, 15, 30]);
      const amt = R.int(2, 40) * 20;
      const up = Math.random() < 0.5;
      const ans = up ? amt * (1 + pct / 100) : amt * (1 - pct / 100);
      return R.input(`${amt} is ${up ? 'increased' : 'decreased'} by ${pct}%. What is the new value?`,
        Number(ans.toFixed(2)),
        `Multiply by ${up ? (1 + pct / 100) : (1 - pct / 100)}.`);
    }
    if (mode === 'interest') {
      const p = R.int(2, 20) * 100, rate = R.pick([2, 3, 4, 5]), yrs = R.int(2, 4);
      const ans = Number((p * rate * yrs / 100).toFixed(2));
      return R.input(`£${p} earns ${rate}% simple interest per year for ${yrs} years. How much interest in total (£)?`,
        ans, `Interest = P × r × t ÷ 100 = ${p} × ${rate} × ${yrs} ÷ 100.`);
    }
    const pct = R.pick([10, 20, 25]);
    const orig = R.int(2, 20) * 50;
    const after = orig * (1 - pct / 100);
    return R.input(`After a ${pct}% discount an item costs £${after}. What was the original price (£)?`,
      orig, `Divide by ${(1 - pct / 100)} to reverse the change.`);
  },

  /* -------------------------------------------------------- measurement --- */
  measurement(y) {
    if (y <= 2) {
      const mode = R.pick(['coins', 'time', 'unit']);
      if (mode === 'coins') {
        const a = R.pick([1, 2, 5, 10, 20, 50]), b = R.pick([1, 2, 5, 10, 20, 50]);
        return R.input(`A ${a}p coin and a ${b}p coin. How many pence altogether?`, a + b, `${a} + ${b} = ${a + b}.`);
      }
      if (mode === 'time') {
        const h = R.int(1, 12), m = R.pick([0, 15, 30, 45]);
        const names = { 0: `${h} o'clock`, 15: `quarter past ${h}`, 30: `half past ${h}`, 45: `quarter to ${h === 12 ? 1 : h + 1}` };
        return R.choice(`What time is ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}?`, names[m],
          [names[0], names[15], names[30], names[45]], 'Read the hour, then the minutes past or to.');
      }
      return R.choice('Which unit would you use to measure the length of a pencil?', 'centimetres',
        ['centimetres', 'kilometres', 'litres', 'grams'], 'Short lengths are measured in centimetres.');
    }
    if (y <= 4) {
      const mode = R.pick(['convert', 'perimeter', 'area', 'time']);
      if (mode === 'convert') {
        const pairs = [['m', 'cm', 100], ['km', 'm', 1000], ['kg', 'g', 1000], ['l', 'ml', 1000]];
        const p = R.pick(pairs), n = R.int(2, 9);
        return R.input(`Convert ${n}${p[0]} into ${p[1]}.`, n * p[2], `1${p[0]} = ${p[2]}${p[1]}, so multiply by ${p[2]}.`);
      }
      if (mode === 'perimeter') {
        const w = R.int(3, 15), h = R.int(3, 15);
        return R.input(`A rectangle is ${w}cm by ${h}cm. What is its perimeter in cm?`, 2 * (w + h),
          'Perimeter = 2 × (width + height).');
      }
      if (mode === 'area') {
        const w = R.int(3, 15), h = R.int(3, 15);
        return R.input(`A rectangle is ${w}cm by ${h}cm. What is its area in cm²?`, w * h, 'Area = width × height.');
      }
      const mins = R.int(70, 300);
      return R.input(`How many hours and minutes is ${mins} minutes?  (e.g. "2 h 15")`,
        `${Math.floor(mins / 60)} h ${mins % 60}`, 'Divide by 60; the remainder is the minutes.');
    }
    const mode = R.pick(['convert', 'area', 'volume', 'speed']);
    if (mode === 'convert') {
      const pairs = [['cm', 'mm', 10], ['m', 'cm', 100], ['km', 'm', 1000], ['kg', 'g', 1000], ['t', 'kg', 1000], ['l', 'ml', 1000]];
      const p = R.pick(pairs), n = Number((R.int(15, 950) / 10).toFixed(1));
      return R.input(`Convert ${n}${p[0]} into ${p[1]}.`, Number((n * p[2]).toFixed(2)), `Multiply by ${p[2]}.`);
    }
    if (mode === 'area') {
      const b = R.int(4, 20), h = R.int(3, 18);
      return R.input(`A triangle has base ${b}cm and perpendicular height ${h}cm. Area in cm²?`,
        Number((b * h / 2).toFixed(2)), 'Area of a triangle = ½ × base × height.');
    }
    if (mode === 'volume') {
      const a = R.int(2, 12), b = R.int(2, 12), c = R.int(2, 12);
      return R.input(`A cuboid measures ${a}cm × ${b}cm × ${c}cm. Volume in cm³?`, a * b * c,
        'Volume of a cuboid = length × width × height.');
    }
    const d = R.int(2, 30) * 5, t = R.int(1, 6);
    return R.input(`A car travels ${d}km in ${t} hours. What is its average speed in km/h?`,
      Number((d / t).toFixed(2)), 'Speed = distance ÷ time.');
  },

  /* ---------------------------------------------------------- geometry ---- */
  geometry(y) {
    if (y <= 2) {
      const shapes = [['triangle', 3], ['square', 4], ['pentagon', 5], ['hexagon', 6], ['octagon', 8]];
      const s = R.pick(shapes);
      return R.input(`How many sides does a ${s[0]} have?`, s[1], `A ${s[0]} has ${s[1]} sides.`);
    }
    if (y <= 4) {
      const mode = R.pick(['angleType', 'quad', 'coords']);
      if (mode === 'angleType') {
        const a = R.int(5, 175);
        const ans = a < 90 ? 'acute' : a === 90 ? 'right angle' : 'obtuse';
        return R.choice(`An angle measures ${a}°. What type of angle is it?`, ans,
          ['acute', 'right angle', 'obtuse', 'reflex'], 'Acute < 90°, right = 90°, obtuse is between 90° and 180°.');
      }
      if (mode === 'quad') {
        return R.choice('Which quadrilateral has four equal sides and four right angles?', 'square',
          ['square', 'rectangle', 'rhombus', 'trapezium'], 'A square is a regular quadrilateral.');
      }
      const x = R.int(1, 9), yy = R.int(1, 9);
      return R.choice(`Point A is at (${x}, ${yy}). Which coordinate is the x-value?`, String(x),
        [String(x), String(yy), String(x + yy), String(Math.abs(x - yy))], 'Along the corridor first, then up the stairs.');
    }
    const mode = y >= 9 ? R.pick(['missingAngle', 'polygon', 'circle', 'pythagoras'])
      : y >= 8 ? R.pick(['missingAngle', 'polygon', 'circle'])
        : R.pick(['missingAngle', 'polygon', 'triangleAngles']);
    if (mode === 'missingAngle') {
      const a = R.int(20, 120), b = R.int(20, 180 - a - 10);
      return R.input(`Two angles in a triangle are ${a}° and ${b}°. What is the third angle?`, 180 - a - b,
        'Angles in a triangle add to 180°.');
    }
    if (mode === 'triangleAngles') {
      const a = R.int(30, 150);
      return R.input(`Angles on a straight line: one is ${a}°. What is the other?`, 180 - a,
        'Angles on a straight line add to 180°.');
    }
    if (mode === 'polygon') {
      const n = R.pick([5, 6, 8, 9, 10, 12]);
      if (Math.random() < 0.5) {
        return R.input(`What is the sum of the interior angles of a polygon with ${n} sides?`, (n - 2) * 180,
          `Sum = (n − 2) × 180 = (${n} − 2) × 180.`);
      }
      return R.input(`What is each exterior angle of a regular ${n}-sided polygon (in degrees)?`,
        Number((360 / n).toFixed(2)), 'Exterior angles of any polygon sum to 360°.');
    }
    if (mode === 'circle') {
      const r = R.int(2, 15);
      if (Math.random() < 0.5) {
        return R.input(`A circle has radius ${r}cm. Circumference to 1 d.p. (cm)?`,
          Number((2 * Math.PI * r).toFixed(1)), 'C = 2πr.');
      }
      return R.input(`A circle has radius ${r}cm. Area to 1 d.p. (cm²)?`,
        Number((Math.PI * r * r).toFixed(1)), 'A = πr².');
    }
    const triples = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17], [7, 24, 25]];
    const t = R.pick(triples);
    return R.input(`A right-angled triangle has legs ${t[0]}cm and ${t[1]}cm. What is the hypotenuse (cm)?`,
      t[2], `a² + b² = c²: ${t[0]}² + ${t[1]}² = ${t[2]}².`);
  },

  /* -------------------------------------------------------- statistics ---- */
  statistics(y) {
    const n = y <= 4 ? 4 : R.int(5, 7);
    const data = Array.from({ length: n }, () => R.int(1, y <= 4 ? 20 : 60));
    const sorted = data.slice().sort((a, b) => a - b);
    const mode = y <= 4 ? R.pick(['total', 'most', 'difference'])
      : R.pick(['mean', 'median', 'range', 'mode', 'total']);
    const list = data.join(', ');
    if (mode === 'total') return R.input(`Find the total of: ${list}`, data.reduce((a, b) => a + b, 0), 'Add every value.');
    if (mode === 'most') return R.input(`Which is the largest value?  ${list}`, Math.max(...data), 'Compare each value.');
    if (mode === 'difference') return R.input(`What is the difference between the largest and smallest?  ${list}`,
      Math.max(...data) - Math.min(...data), 'Largest − smallest.');
    if (mode === 'range') return R.input(`Find the range of: ${list}`, sorted[n - 1] - sorted[0], 'Range = largest − smallest.');
    if (mode === 'mean') {
      const sum = data.reduce((a, b) => a + b, 0);
      return R.input(`Find the mean of: ${list}  (to 2 d.p. if needed)`, Number((sum / n).toFixed(2)),
        `Total ${sum} ÷ ${n} values.`);
    }
    if (mode === 'median') {
      const med = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
      return R.input(`Find the median of: ${list}`, med, 'Order the values, then take the middle one.');
    }
    const rep = R.pick(data);
    const withMode = data.concat([rep, rep]);
    return R.input(`Find the mode of: ${R.shuffle(withMode).join(', ')}`, rep, 'The mode is the most frequent value.');
  },

  /* --------------------------------------------------- negative numbers --- */
  negatives(y) {
    const mode = R.pick(['add', 'sub', 'order', 'temp', y >= 7 ? 'mul' : 'temp']);
    const a = R.int(-20, 20);
    let b = R.int(-20, 20);
    if (b === 0) b = -7;
    const br = n => (n < 0 ? `(${n})` : String(n));   // only bracket negatives
    if (mode === 'add') return R.input(`${a} + ${br(b)} = ?`, a + b,
      b < 0 ? 'Adding a negative moves left on the number line.' : 'Count on from the first number.');
    if (mode === 'sub') return R.input(`${a} − ${br(b)} = ?`, a - b,
      b < 0 ? 'Subtracting a negative is the same as adding.' : 'Count back from the first number.');
    if (mode === 'mul') return R.input(`${a} × ${br(b)} = ?`, a * b,
      'Same signs give a positive; different signs give a negative.');
    if (mode === 'order') {
      const set = Array.from({ length: 4 }, () => R.int(-30, 30));
      return R.input(`Which is the smallest?  ${set.join(', ')}`, Math.min(...set), 'The furthest left on the number line is smallest.');
    }
    const t1 = R.int(-15, 5), rise = R.int(3, 20);
    return R.input(`The temperature is ${t1}°C and rises by ${rise}°C. What is the new temperature?`, t1 + rise,
      'Count up the number line from the starting temperature.');
  },

  /* ---------------------------------------------- factors, multiples, HCF -- */
  primesFactors(y) {
    const mode = R.pick(['prime', 'factors', 'hcf', 'lcm', 'square']);
    if (mode === 'prime') {
      const nums = [11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
      const comps = [9, 15, 21, 25, 27, 33, 35, 39, 45, 49, 51];
      const p = R.pick(nums);
      const three = R.shuffle(comps).slice(0, 3);
      return R.choice(`Which of these is a prime number?`, p, three,
        'A prime has exactly two factors: 1 and itself.');
    }
    if (mode === 'factors') {
      const n = R.pick([12, 18, 20, 24, 28, 30, 36, 40, 48, 60]);
      const f = []; for (let i = 1; i <= n; i++) if (n % i === 0) f.push(i);
      return R.input(`How many factors does ${n} have?`, f.length, `They are: ${f.join(', ')}.`);
    }
    if (mode === 'square') {
      const n = R.int(2, 15);
      if (Math.random() < 0.5) return R.input(`What is ${n}²?`, n * n, `${n} × ${n} = ${n * n}.`);
      return R.input(`What is √${n * n}?`, n, `${n} × ${n} = ${n * n}.`);
    }
    const a = R.int(6, 40), b = R.int(6, 40);
    if (mode === 'hcf') return R.input(`Find the highest common factor of ${a} and ${b}.`, R.gcd(a, b),
      'List the factors of each, or use prime factorisation.');
    return R.input(`Find the lowest common multiple of ${a} and ${b}.`, (a * b) / R.gcd(a, b),
      'LCM = (a × b) ÷ HCF.');
  },

  /* ----------------------------------------------------------- algebra ---- */
  algebra(y) {
    if (y <= 6) {
      const mode = R.pick(['substitute', 'missing', 'formula']);
      if (mode === 'substitute') {
        const a = R.int(2, 12), x = R.int(2, 12), c = R.int(1, 20);
        return R.input(`If x = ${x}, what is ${a}x + ${c}?`, a * x + c, `Replace x with ${x}: ${a} × ${x} + ${c}.`);
      }
      if (mode === 'missing') {
        const x = R.int(2, 20), b = R.int(2, 30);
        return R.input(`Solve:  x + ${b} = ${x + b}`, x, `Subtract ${b} from both sides.`);
      }
      const n = R.int(2, 12);
      return R.input(`The perimeter of a square is P = 4s. If s = ${n}, what is P?`, 4 * n, `4 × ${n}.`);
    }
    const pool = y >= 9
      ? ['solve2', 'expand', 'factorise', 'quadratic', 'nth', 'simultaneous', 'inequality']
      : y === 8 ? ['solve2', 'expand', 'factorise', 'nth', 'gradient'] : ['solve1', 'solve2', 'substitute', 'simplify', 'nth'];
    const mode = R.pick(pool);
    if (mode === 'substitute') {
      const a = R.int(2, 9), b = R.int(2, 9), x = R.int(-6, 9);
      return R.input(`If x = ${x}, evaluate ${a}x² − ${b}.`, a * x * x - b, `${a} × (${x})² − ${b}.`);
    }
    if (mode === 'simplify') {
      const a = R.int(2, 9), b = R.int(2, 9), c = R.int(2, 9);
      return R.input(`Simplify:  ${a}x + ${b}x − ${c}x   (answer like "5x")`, `${a + b - c}x`, 'Collect the like terms.');
    }
    if (mode === 'solve1') {
      const a = R.int(2, 9), x = R.int(2, 12);
      return R.input(`Solve:  ${a}x = ${a * x}`, x, `Divide both sides by ${a}.`);
    }
    if (mode === 'solve2') {
      const a = R.int(2, 9), b = R.int(1, 20), x = R.int(2, 12);
      return R.input(`Solve:  ${a}x + ${b} = ${a * x + b}`, x, `Subtract ${b}, then divide by ${a}.`);
    }
    if (mode === 'expand') {
      const a = R.int(2, 9), b = R.int(2, 9), c = R.int(2, 9);
      return R.input(`Expand:  ${a}(${b}x + ${c})   (answer like "6x + 9")`, `${a * b}x + ${a * c}`,
        'Multiply everything inside the bracket by the term outside.');
    }
    if (mode === 'factorise') {
      // a and b must be coprime, or the expression would not be fully factorised.
      let a, b, guard = 0;
      do { a = R.int(2, 9); b = R.int(2, 9); guard++; } while (R.gcd(a, b) !== 1 && guard < 40);
      if (R.gcd(a, b) !== 1) { a = 2; b = 3; }
      const k = R.int(2, 9);
      return R.input(`Factorise fully:  ${k * a}x + ${k * b}   (answer like "3(2x + 5)")`, `${k}(${a}x + ${b})`,
        `The highest common factor of ${k * a} and ${k * b} is ${k}.`);
    }
    if (mode === 'quadratic') {
      const p = R.int(1, 9), q = R.int(1, 9);
      return R.input(`Factorise:  x² + ${p + q}x + ${p * q}   (answer like "(x + 2)(x + 3)")`,
        `(x + ${Math.min(p, q)})(x + ${Math.max(p, q)})`,
        `Find two numbers that multiply to ${p * q} and add to ${p + q}.`);
    }
    if (mode === 'nth') {
      const d = R.int(2, 9), first = R.int(-5, 12);
      const seq = [0, 1, 2, 3].map(i => first + i * d);
      const c = first - d;
      return R.input(`Find the nth term of:  ${seq.join(', ')}, ...   (answer like "3n + 1")`,
        `${d}n ${c < 0 ? '- ' + Math.abs(c) : '+ ' + c}`,
        `The common difference is ${d}, so start with ${d}n and adjust by ${c}.`);
    }
    if (mode === 'gradient') {
      const m = R.int(-5, 6), c = R.int(-8, 9);
      return R.input(`What is the gradient of  y = ${m}x ${c < 0 ? '− ' + Math.abs(c) : '+ ' + c}?`, m,
        'In y = mx + c, m is the gradient.');
    }
    if (mode === 'inequality') {
      const a = R.int(2, 6), b = R.int(1, 15), x = R.int(2, 10);
      return R.input(`Solve:  ${a}x + ${b} < ${a * x + b + a}   (answer like "x < 5")`, `x < ${x + 1}`,
        `Subtract ${b}, then divide by ${a}. The sign stays the same when dividing by a positive.`);
    }
    const x = R.int(4, 12);
    let yv = R.int(1, 9);
    if (yv === x) yv = x === 1 ? 2 : x - 1;
    return R.input(`Solve the simultaneous equations:  x + y = ${x + yv},  x − y = ${x - yv}.  (answer like "x=3, y=1")`,
      `x=${x}, y=${yv}`, 'Add the equations to eliminate y, then substitute back.');
  },

  /* ------------------------------------------------- ratio & proportion --- */
  ratio(y) {
    const mode = y >= 9 ? R.pick(['share', 'simplify', 'unitary', 'speed', 'density'])
      : R.pick(['share', 'simplify', 'unitary', 'recipe']);
    if (mode === 'share') {
      const a = R.int(1, 6);
      let b = R.int(1, 6);
      if (b === a) b = a === 6 ? 1 : a + 1;   // a 4:4 share has no "larger" part
      const unit = R.int(3, 25);
      const total = (a + b) * unit;
      return R.input(`Share ${total} in the ratio ${a}:${b}. What is the larger share?`,
        Math.max(a, b) * unit, `There are ${a + b} parts, so one part is ${unit}.`);
    }
    if (mode === 'simplify') {
      const k = R.int(2, 9), a = R.int(2, 9), b = R.int(2, 9);
      const g = R.gcd(a, b);
      return R.input(`Simplify the ratio ${k * a}:${k * b}   (answer like "3:4")`, `${a / g}:${b / g}`,
        `Divide both sides by their highest common factor.`);
    }
    if (mode === 'unitary') {
      const n = R.int(2, 9), cost = R.int(2, 30) * n, m = R.int(2, 12);
      return R.input(`${n} pens cost £${cost}. How much do ${m} pens cost (£)?`, (cost / n) * m,
        `One pen costs £${cost / n}, so multiply by ${m}.`);
    }
    if (mode === 'recipe') {
      const p = R.int(2, 6), g = R.int(2, 20) * 25, np = R.int(2, 12);
      return R.input(`A recipe for ${p} people uses ${g}g of flour. How much for ${np} people (g)?`,
        Number(((g / p) * np).toFixed(2)), `Find the amount per person, then multiply.`);
    }
    if (mode === 'speed') {
      const s = R.int(20, 120), t = R.int(1, 5);
      return R.input(`A train travels at ${s} km/h for ${t} hours. How far does it go (km)?`, s * t,
        'Distance = speed × time.');
    }
    const m = R.int(20, 400), v = R.int(2, 20);
    return R.input(`An object has mass ${m}g and volume ${v}cm³. Density in g/cm³ (2 d.p.)?`,
      Number((m / v).toFixed(2)), 'Density = mass ÷ volume.');
  },

  /* -------------------------------------------------------- probability --- */
  probability(y) {
    const mode = R.pick(['single', 'complement', 'dice', y >= 9 ? 'combined' : 'single']);
    if (mode === 'single') {
      const r = R.int(1, 6), b = R.int(1, 6), g = R.int(1, 6);
      const total = r + b + g;
      const [sn, sd] = simplify(r, total);
      return R.input(`A bag has ${r} red, ${b} blue and ${g} green counters. P(red) as a fraction in simplest form?`,
        fracStr(sn, sd), `${r} favourable out of ${total}, simplified.`);
    }
    if (mode === 'complement') {
      const p = R.pick([0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.6, 0.75]);
      return R.input(`The probability it rains is ${p}. What is the probability it does not rain?`,
        Number((1 - p).toFixed(2)), 'Probabilities of an event and its complement sum to 1.');
    }
    if (mode === 'dice') {
      const target = R.int(2, 6);
      const [sn, sd] = simplify(target - 1, 36);
      return R.input(`Two fair dice are rolled. P(total = ${target}) as a fraction in simplest form?`,
        fracStr(sn, sd), `There are ${target - 1} ways out of 36 outcomes.`);
    }
    const p1 = R.pick([2, 3, 4, 5]), p2 = R.pick([2, 3, 4, 5]);
    const [sn, sd] = simplify(1, p1 * p2);
    return R.input(`Two independent events have probabilities 1/${p1} and 1/${p2}. P(both happen), simplest form?`,
      fracStr(sn, sd), 'For independent events, multiply the probabilities.');
  },

  /* ----------------------------------------------- indices & standard form -- */
  indices(y) {
    const mode = y >= 9 ? R.pick(['law', 'evaluate', 'standard', 'standardCalc']) : R.pick(['law', 'evaluate', 'root']);
    if (mode === 'law') {
      const b = R.int(2, 9), m = R.int(2, 8), n = R.int(2, 8);
      if (Math.random() < 0.5) {
        return R.input(`Simplify:  ${b}^${m} × ${b}^${n}   (answer like "2^7")`, `${b}^${m + n}`,
          'When multiplying powers of the same base, add the indices.');
      }
      const big = m + n;
      return R.input(`Simplify:  ${b}^${big} ÷ ${b}^${n}   (answer like "2^7")`, `${b}^${big - n}`,
        'When dividing powers of the same base, subtract the indices.');
    }
    if (mode === 'evaluate') {
      const b = R.int(2, 6), n = R.int(2, 5);
      return R.input(`Evaluate ${b}^${n}.`, Math.pow(b, n), `${b} multiplied by itself ${n} times.`);
    }
    if (mode === 'root') {
      const n = R.int(2, 12);
      return R.input(`What is the cube root of ${n * n * n}?`, n, `${n} × ${n} × ${n} = ${n * n * n}.`);
    }
    if (mode === 'standard') {
      const d = R.int(1, 9), extra = R.int(1, 3), pow = R.int(3, 7);
      const mant = Number((d + extra / 10).toFixed(1));
      const val = mant * Math.pow(10, pow);
      return R.input(`Write ${val.toLocaleString('en-GB')} in standard form.  (answer like "3.2 x 10^5")`,
        `${mant} x 10^${pow}`, 'Standard form is A × 10ⁿ where 1 ≤ A < 10.');
    }
    const a = R.int(2, 9), b = R.int(2, 9), p = R.int(2, 6), q = R.int(2, 6);
    const mant = Number((a * b).toFixed(2));
    const pw = p + q;
    const norm = mant >= 10 ? [Number((mant / 10).toFixed(2)), pw + 1] : [mant, pw];
    return R.input(`(${a} x 10^${p}) × (${b} x 10^${q}) = ?   (standard form, like "3.2 x 10^5")`,
      `${norm[0]} x 10^${norm[1]}`, 'Multiply the numbers, add the powers, then normalise so 1 ≤ A < 10.');
  }
};
