const MONTH_MAP = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function localDateYmd() {
  const d = new Date();
  return (
    d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
  );
}

export function dateAtOffsetFromEndYmd(endYmd, dayOffset) {
  const p = String(endYmd).split("-");
  const y = +p[0];
  const mo = +p[1];
  const d = +p[2];
  const t = new Date(y, mo - 1, d, 12, 0, 0);
  t.setDate(t.getDate() - dayOffset);
  return t;
}

export function ymdFromLocalDate(dt) {
  return (
    dt.getFullYear() +
    "-" +
    pad2(dt.getMonth() + 1) +
    "-" +
    pad2(dt.getDate())
  );
}

function isValidYmd(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, mo - 1, d);
  return (
    !isNaN(dt.getTime()) &&
    dt.getFullYear() === y &&
    dt.getMonth() === mo - 1 &&
    dt.getDate() === d
  );
}

function packDate(y, mo, d) {
  const dt = new Date(y, mo - 1, d);
  const key = y + "-" + pad2(mo) + "-" + pad2(d);
  return { date: dt, key: key, label: key };
}

function restSplicing(line, start, end) {
  return (line.slice(0, start) + line.slice(end))
    .replace(/^\s+/, "")
    .replace(/\s+$/, "");
}

function extractFirstDateInLine(line) {
  const s = String(line);
  const cands = [];
  let m;
  const reIso =
    /\b(\d{4})-(\d{2})-(\d{2})(?![0-9])/g;
  while ((m = reIso.exec(s)) !== null) {
    const y = +m[1],
      mo = +m[2],
      d = +m[3];
    if (isValidYmd(y, mo, d)) {
      cands.push({
        start: m.index,
        end: m.index + m[0].length,
        y: y,
        mo: mo,
        d: d,
      });
    }
  }
  const reCn = /(\d{4})年(\d{1,2})月(\d{1,2})日?/g;
  while ((m = reCn.exec(s)) !== null) {
    const y = +m[1],
      mo = +m[2],
      d = +m[3];
    if (isValidYmd(y, mo, d)) {
      cands.push({
        start: m.index,
        end: m.index + m[0].length,
        y: y,
        mo: mo,
        d: d,
      });
    }
  }
  const reYmdSlash =
    /\b(\d{4})\/(\d{2})\/(\d{2})(?![0-9])/g;
  while ((m = reYmdSlash.exec(s)) !== null) {
    const y = +m[1],
      mo = +m[2],
      d = +m[3];
    if (isValidYmd(y, mo, d)) {
      cands.push({
        start: m.index,
        end: m.index + m[0].length,
        y: y,
        mo: mo,
        d: d,
      });
    }
  }
  const reDmySlash = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
  while ((m = reDmySlash.exec(s)) !== null) {
    const a = +m[1],
      b = +m[2],
      y = +m[3];
    let d;
    let mo;
    if (a > 12) {
      d = a;
      mo = b;
    } else if (b > 12) {
      mo = a;
      d = b;
    } else {
      d = a;
      mo = b;
    }
    if (isValidYmd(y, mo, d)) {
      cands.push({
        start: m.index,
        end: m.index + m[0].length,
        y: y,
        mo: mo,
        d: d,
      });
    }
  }
  const reDots = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g;
  while ((m = reDots.exec(s)) !== null) {
    const d = +m[1],
      mo = +m[2],
      y = +m[3];
    if (isValidYmd(y, mo, d)) {
      cands.push({
        start: m.index,
        end: m.index + m[0].length,
        y: y,
        mo: mo,
        d: d,
      });
    }
  }
  const reCompact =
    /\b(20\d{2})(\d{2})(\d{2})(?![0-9])/g;
  while ((m = reCompact.exec(s)) !== null) {
    const y = +m[1],
      mo = +m[2],
      d = +m[3];
    if (isValidYmd(y, mo, d)) {
      cands.push({
        start: m.index,
        end: m.index + m[0].length,
        y: y,
        mo: mo,
        d: d,
      });
    }
  }
  const reEpoch = /\b(?:\d{10}|\d{13})\b/g;
  while ((m = reEpoch.exec(s)) !== null) {
    const rawN = m[0];
    const n = +rawN;
    const ms = rawN.length >= 13 ? n : n * 1000;
    if (ms < 9466848e5 || ms > 41024448e5) continue;
    const dt = new Date(ms);
    if (isNaN(dt.getTime())) continue;
    const y = dt.getFullYear(),
      mo = dt.getMonth() + 1,
      d = dt.getDate();
    cands.push({
      start: m.index,
      end: m.index + m[0].length,
      y: y,
      mo: mo,
      d: d,
    });
  }
  const reMonWord =
    /\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b|\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/g;
  while ((m = reMonWord.exec(s)) !== null) {
    let y;
    let mo0;
    let d;
    if (m[1]) {
      d = +m[1];
      mo0 = MONTH_MAP[String(m[2]).toLowerCase().slice(0, 3)];
      y = +m[3];
    } else {
      mo0 = MONTH_MAP[String(m[4]).toLowerCase().slice(0, 3)];
      d = +m[5];
      y = +m[6];
    }
    if (mo0 != null && isValidYmd(y, mo0 + 1, d)) {
      cands.push({
        start: m.index,
        end: m.index + m[0].length,
        y: y,
        mo: mo0 + 1,
        d: d,
      });
    }
  }
  if (!cands.length) return null;
  cands.sort(function (a, b) {
    return a.start - b.start || a.end - b.end;
  });
  const pick = cands[0];
  const pk = packDate(pick.y, pick.mo, pick.d);
  return {
    date: pk.date,
    key: pk.key,
    label: pk.label,
    rest: restSplicing(s, pick.start, pick.end),
    consumed: s.slice(pick.start, pick.end),
  };
}

function extractAnchoredDate(line) {
  const s = String(line);
  if (!s.trim()) return null;
  let m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T t](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:Z|([+-])(\d{2}):?(\d{2}))?)?(?![0-9])/,
  );
  if (m) {
    const y = +m[1],
      mo = +m[2],
      d = +m[3];
    const rest = s.slice(m[0].length).replace(/^\s+/, "");
    if (isValidYmd(y, mo, d)) {
      const pk = packDate(y, mo, d);
      return {
        date: pk.date,
        key: pk.key,
        label: pk.label,
        rest: rest,
        consumed: m[0],
      };
    }
  }
  m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})[.,](\d{1,3})\b/,
  );
  if (m) {
    const y = +m[1],
      mo = +m[2],
      d = +m[3];
    const rest = s.slice(m[0].length).replace(/^\s+/, "");
    if (isValidYmd(y, mo, d)) {
      const pk = packDate(y, mo, d);
      return {
        date: pk.date,
        key: pk.key,
        label: pk.label,
        rest: rest,
        consumed: m[0],
      };
    }
  }
  m = s.match(
    /^\[(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?)?(?:[^\]]*)\]\s*/,
  );
  if (m) {
    const y = +m[1],
      mo = +m[2],
      d = +m[3];
    const full = m[0];
    const rest = s.slice(full.length).replace(/^\s+/, "");
    if (isValidYmd(y, mo, d)) {
      const pk = packDate(y, mo, d);
      return {
        date: pk.date,
        key: pk.key,
        label: pk.label,
        rest: rest,
        consumed: full,
      };
    }
  }
  m = s.match(
    /^\[(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})(?:[^\]]*)\]\s*/,
  );
  if (m) {
    const day = +m[1],
      mon = MONTH_MAP[String(m[2]).toLowerCase().slice(0, 3)];
    const y = +m[3];
    if (mon != null) {
      const full = m[0];
      const rest = s.slice(full.length).replace(/^\s+/, "");
      if (isValidYmd(y, mon + 1, day)) {
        const pk = packDate(y, mon + 1, day);
        return {
          date: pk.date,
          key: pk.key,
          label: pk.label,
          rest: rest,
          consumed: full,
        };
      }
    }
  }
  m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mon = MONTH_MAP[String(m[1]).toLowerCase().slice(0, 3)];
    const day = +m[2];
    const y = +m[3];
    if (mon != null && isValidYmd(y, mon + 1, day)) {
      const full = m[0];
      const rest = s.slice(full.length).replace(/^\s+/, "");
      const pk = packDate(y, mon + 1, day);
      return {
        date: pk.date,
        key: pk.key,
        label: pk.label,
        rest: rest,
        consumed: full,
      };
    }
  }
  m = s.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const mon = MONTH_MAP[String(m[1]).toLowerCase().slice(0, 3)];
    const day = +m[2];
    if (mon != null) {
      const yGuess = new Date().getFullYear();
      let dt = new Date(yGuess, mon, day);
      if (dt.getTime() > Date.now() + 864e5 * 120) {
        dt = new Date(yGuess - 1, mon, day);
      }
      const full = m[0];
      const rest = s.slice(full.length).replace(/^\s+/, "");
      if (!isNaN(dt.getTime())) {
        const y = dt.getFullYear();
        const pk = packDate(y, mon + 1, day);
        return {
          date: pk.date,
          key: pk.key,
          label: pk.label,
          rest: rest,
          consumed: full,
        };
      }
    }
  }
  m = s.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}):(\d{2}))?\b/,
  );
  if (m) {
    const d = +m[1],
      mo = +m[2],
      y = +m[3];
    if (isValidYmd(y, mo, d)) {
      const pk = packDate(y, mo, d);
      const rest = s.slice(m[0].length).replace(/^\s+/, "");
      return {
        date: pk.date,
        key: pk.key,
        label: pk.label,
        rest: rest,
        consumed: m[0],
      };
    }
  }
  m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?\b/);
  if (m) {
    const y = +m[1],
      mo = +m[2],
      d = +m[3];
    if (isValidYmd(y, mo, d)) {
      const pk = packDate(y, mo, d);
      const rest = s.slice(m[0].length).replace(/^\s+/, "");
      return {
        date: pk.date,
        key: pk.key,
        label: pk.label,
        rest: rest,
        consumed: m[0],
      };
    }
  }
  m = s.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?\b/,
  );
  if (m) {
    const d = +m[1],
      mo = +m[2],
      y = +m[3];
    if (isValidYmd(y, mo, d)) {
      const pk = packDate(y, mo, d);
      const rest = s.slice(m[0].length).replace(/^\s+/, "");
      return {
        date: pk.date,
        key: pk.key,
        label: pk.label,
        rest: rest,
        consumed: m[0],
      };
    }
  }
  m = s.match(
    /\[(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})(?:[^\]]*)\]/,
  );
  if (m && m.index != null) {
    const day = +m[1],
      mon = MONTH_MAP[String(m[2]).toLowerCase().slice(0, 3)];
    const y = +m[3];
    if (mon != null) {
      const full = m[0];
      const start = m.index;
      if (isValidYmd(y, mon + 1, day)) {
        const pk = packDate(y, mon + 1, day);
        const rest = restSplicing(s, start, start + full.length);
        return {
          date: pk.date,
          key: pk.key,
          label: pk.label,
          rest: rest,
          consumed: full,
        };
      }
    }
  }
  return null;
}

export function extractDateAndRest(line) {
  return extractAnchoredDate(line) || extractFirstDateInLine(line);
}
