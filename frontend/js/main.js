(function () {
  const listEl = document.getElementById("log-list");
  const rootEl = document.getElementById("log-root");
  const errorEl = document.getElementById("error-banner");
  const emptyEl = document.getElementById("list-empty");
  const legendEl = document.getElementById("legend");
  const timelineTitleEl = document.getElementById("timeline-title");
  const timelineMetaEl = document.getElementById("timeline-meta");
  const timelineChartEl = document.getElementById("timeline-chart");
  const timelinePlaceholderEl = document.getElementById("timeline-placeholder");

  let selectedItemEl = null;

  function clearPickedMicroCellsExceptRow(keepRow) {
    if (!listEl) return;
    listEl.querySelectorAll(".log-list__hourly-cell--picked").forEach(
      function (el) {
        const r = el.closest(".log-list__item");
        if (!keepRow) {
          el.classList.remove("log-list__hourly-cell--picked");
        } else if (r && r !== keepRow) {
          el.classList.remove("log-list__hourly-cell--picked");
        }
      },
    );
  }

  function clearPickedMicroCellsInRow(row) {
    if (!row) return;
    row.querySelectorAll(".log-list__hourly-cell--picked").forEach(function (el) {
      el.classList.remove("log-list__hourly-cell--picked");
    });
  }

  function markPickedDayDrill(dayCell) {
    if (!dayCell) return;
    const row = dayCell.closest(".log-list__item");
    if (!row) return;
    clearPickedMicroCellsExceptRow(row);
    clearPickedMicroCellsInRow(row);
    dayCell.classList.add("log-list__hourly-cell--picked");
  }

  function markPickedHourDrill(hourCell, todayYmd) {
    if (!hourCell) return;
    const row = hourCell.closest(".log-list__item");
    if (!row) return;
    clearPickedMicroCellsExceptRow(row);
    clearPickedMicroCellsInRow(row);
    hourCell.classList.add("log-list__hourly-cell--picked");
    const y = String(todayYmd).replace(/"/g, "");
    const todayDay = row.querySelector(
      '.log-list__hourly--recent .log-list__hourly-blocks [data-drill-ymd="' +
        y +
        '"]',
    );
    if (todayDay) {
      todayDay.classList.add("log-list__hourly-cell--picked");
    }
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || res.statusText || String(res.status));
    }
    return data;
  }

  /**
   * ⬇️ Infer a representative app / stack emoji from the log file name (heuristic).
   */
  function appEmojiForLogName(name) {
    const n = String(name).toLowerCase();
    if (n.includes("docker")) return "🐳";
    if (n.includes("mysql") || n.includes("mariadb")) return "🐬";
    if (n.includes("postgres")) return "🐘";
    if (n.includes("mongo")) return "🍃";
    if (n.includes("redis")) return "⚡";
    if (n.includes("nginx")) return "🌐";
    if (n.includes("apache") || n.includes("httpd")) return "🪶";
    if (n.includes("node") || n.includes("npm")) return "🟢";
    if (
      n.includes("python") ||
      n.includes("uvicorn") ||
      n.includes("gunicorn")
    )
      return "🐍";
    if (n.includes("java") || n.includes("tomcat") || n.includes("spring"))
      return "☕";
    if (n.includes("elastic")) return "🔍";
    if (n.includes("kafka")) return "📨";
    if (n.includes("rabbit")) return "🐰";
    if (n.includes("git")) return "📂";
    return "📄";
  }

  function buildIssueSummary(errorCount, warningCount) {
    const err = Number(errorCount) || 0;
    const warn = Number(warningCount) || 0;
    if (err === 0 && warn === 0) return null;
    const wrap = document.createElement("span");
    wrap.className = "log-list__stats";
    wrap.setAttribute(
      "aria-label",
      summarizeCountsAria(err, warn),
    );
    if (err > 0) {
      wrap.appendChild(statChip("🚨", err, "errors"));
    }
    if (warn > 0) {
      wrap.appendChild(statChip("⚠️", warn, "warnings"));
    }
    return wrap;
  }

  function statChip(emoji, n, kind) {
    const span = document.createElement("span");
    span.className = "log-list__stat";
    const icon = document.createElement("span");
    icon.className = "log-list__stat-emoji";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = emoji;
    const num = document.createElement("span");
    num.className = "log-list__stat-num";
    num.textContent = String(n);
    span.appendChild(icon);
    span.appendChild(num);
    span.title = n + " " + kind;
    return span;
  }

  function summarizeCountsAria(err, warn) {
    const parts = [];
    if (err) parts.push(err + " error pattern" + (err === 1 ? "" : "s"));
    if (warn) parts.push(warn + " warning pattern" + (warn === 1 ? "" : "s"));
    return parts.join(", ") + " in sampled content";
  }

  function rowAriaLabel(name, err, warn) {
    const app = appEmojiForLogName(name);
    let tail = "";
    if (err || warn) {
      tail = ". " + summarizeCountsAria(err, warn);
    } else {
      tail = ". No error or warning patterns in sample";
    }
    return "Show timeline for " + name + ". Source hint " + app + tail;
  }

  function formatBytes(n) {
    const x = Number(n) || 0;
    if (x < 1024) return x + " B";
    if (x < 1024 * 1024) return (x / 1024).toFixed(1) + " KB";
    return (x / (1024 * 1024)).toFixed(1) + " MB";
  }

  /**
   * ⬇️ Pick an emoji for a single log line (severity / kind heuristics).
   */
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

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function localDateYmd() {
    const d = new Date();
    return (
      d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
    );
  }

  function buildTodayHourStrip(hours, currentHour, dateLabel, drillCtx) {
    const wrap = document.createElement("div");
    wrap.className = "log-list__hourly";
    wrap.title =
      "Local calendar day " +
      dateLabel +
      ": hourly log health. Click an hour to scroll the timeline to that time on this day.";
    const rowBlocks = document.createElement("div");
    rowBlocks.className =
      "log-list__hourly-row log-list__hourly-row--blocks";
    const clock = document.createElement("span");
    clock.className = "log-list__hourly-clock";
    clock.setAttribute("aria-hidden", "true");
    clock.textContent = "🕐";
    const blocks = document.createElement("div");
    blocks.className = "log-list__hourly-blocks";
    const labelBy = {
      empty: "no lines this hour",
      ok: "normal",
      warning: "warning pattern",
      error: "error pattern",
      error_warning: "error and warning patterns",
    };
    const tickAt = { 0: true, 6: true, 12: true, 18: true };
    for (let h = 0; h < 24; h++) {
      const cell = document.createElement("span");
      const kind = hours[h] || "empty";
      cell.className =
        "log-list__hourly-cell log-list__hourly-cell--" + kind;
      if (tickAt[h]) {
        cell.classList.add("log-list__hourly-cell--label");
        cell.textContent = pad2(h);
      }
      if (h === currentHour) {
        cell.classList.add("log-list__hourly-cell--now");
      }
      cell.title = pad2(h) + ":00 — " + (labelBy[kind] || kind);
      if (
        drillCtx &&
        drillCtx.logName &&
        drillCtx.itemLi &&
        drillCtx.todayYmd
      ) {
        cell.classList.add("log-list__hourly-cell--drill");
        cell.setAttribute("role", "button");
        cell.setAttribute("tabindex", "0");
        cell.setAttribute(
          "aria-label",
          "Scroll timeline to " +
            dateLabel +
            " " +
            pad2(h) +
            ":00 for " +
            drillCtx.logName,
        );
        const logName = drillCtx.logName;
        const rowLi = drillCtx.itemLi;
        const ymd = drillCtx.todayYmd;
        const hour = h;
        cell.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          void drillTimelineToTodayHour(logName, ymd, hour, rowLi, cell);
        });
        cell.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            ev.stopPropagation();
            void drillTimelineToTodayHour(logName, ymd, hour, rowLi, cell);
          }
        });
      }
      blocks.appendChild(cell);
    }
    rowBlocks.appendChild(clock);
    rowBlocks.appendChild(blocks);

    wrap.appendChild(rowBlocks);
    return wrap;
  }

  function dateAtOffsetFromEndYmd(endYmd, dayOffset) {
    const p = String(endYmd).split("-");
    const y = +p[0];
    const mo = +p[1];
    const d = +p[2];
    const t = new Date(y, mo - 1, d, 12, 0, 0);
    t.setDate(t.getDate() - dayOffset);
    return t;
  }

  function ymdFromLocalDate(dt) {
    return (
      dt.getFullYear() +
      "-" +
      pad2(dt.getMonth() + 1) +
      "-" +
      pad2(dt.getDate())
    );
  }

  function buildRecentDaysStrip(days24, endYmd, drillCtx) {
    const wrap = document.createElement("div");
    wrap.className = "log-list__hourly log-list__hourly--recent";
    wrap.title =
      "Last 24 calendar days ending " +
      endYmd +
      " (right = most recent day): daily log health. Click a day to scroll the timeline.";
    const rowBlocks = document.createElement("div");
    rowBlocks.className =
      "log-list__hourly-row log-list__hourly-row--blocks";
    const cal = document.createElement("span");
    cal.className = "log-list__hourly-clock";
    cal.setAttribute("aria-hidden", "true");
    cal.textContent = "📅";
    const blocks = document.createElement("div");
    blocks.className = "log-list__hourly-blocks";
    const labelBy = {
      empty: "no lines",
      ok: "normal",
      warning: "warning pattern",
      error: "error pattern",
      error_warning: "error and warning patterns",
    };
    for (let i = 0; i < 24; i++) {
      const cell = document.createElement("span");
      const kind = days24[i] || "empty";
      cell.className =
        "log-list__hourly-cell log-list__hourly-cell--" + kind;
      const dayOffsetFromEnd = 23 - i;
      const slotDate = dateAtOffsetFromEndYmd(endYmd, dayOffsetFromEnd);
      const ymd = ymdFromLocalDate(slotDate);
      const isTodaySlot = i === 23;
      if (slotDate.getDay() === 1 && !isTodaySlot) {
        cell.classList.add("log-list__hourly-cell--label");
        cell.textContent = String(slotDate.getDate());
      }
      if (isTodaySlot) {
        cell.classList.add("log-list__hourly-cell--label");
        cell.textContent = String(slotDate.getDate());
        cell.classList.add("log-list__hourly-cell--now");
      }
      cell.title = ymd + " — " + (labelBy[kind] || kind);
      if (drillCtx && drillCtx.logName && drillCtx.itemLi) {
        cell.dataset.drillYmd = ymd;
        cell.classList.add("log-list__hourly-cell--drill");
        cell.setAttribute("role", "button");
        cell.setAttribute("tabindex", "0");
        cell.setAttribute(
          "aria-label",
          "Scroll timeline to " + ymd + " for " + drillCtx.logName,
        );
        const logName = drillCtx.logName;
        const rowLi = drillCtx.itemLi;
        cell.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          void drillTimelineToDate(logName, ymd, rowLi, cell);
        });
        cell.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            ev.stopPropagation();
            void drillTimelineToDate(logName, ymd, rowLi, cell);
          }
        });
      }
      blocks.appendChild(cell);
    }
    rowBlocks.appendChild(cal);
    rowBlocks.appendChild(blocks);
    wrap.appendChild(rowBlocks);
    return wrap;
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

  function extractDateAndRest(line) {
    return extractAnchoredDate(line) || extractFirstDateInLine(line);
  }

  function statKindForLine(line) {
    const s = String(line);
    const t = s.trim();
    if (!t) return "other";
    if (/^\[[…]/.test(t) || /^\[\.\.\./.test(t)) return "other";
    if (/traceback|exception|\bfatal\b|\bcritical\b|\berror\b|errno\s+/i.test(s))
      return "error";
    if (/\bwarn(?:ing)?\b|\] warn\b/i.test(s)) return "warning";
    if (/\bdebug\b/i.test(s)) return "debug";
    if (/\binfo\b|\] info\b/i.test(s)) return "info";
    if (/\s5\d{2}(\s|$|,)/.test(s) || /" 5\d{2} /.test(s)) return "error";
    if (/\s4\d{2}(\s|$|,)/.test(s) || /" 4\d{2} /.test(s)) return "warning";
    if (
      /\b(?:listening|started|running|ready)\b/i.test(s) &&
      !/\berror\b/i.test(s)
    )
      return "lifecycle";
    if (/\b(?:shutdown|stopped|terminated|killed)\b/i.test(s))
      return "lifecycle";
    if (/\s2\d{2}(\s|$|,)/.test(s) || /\b200 ok\b/i.test(s)) return "success";
    if (/\b(?:success|succeeded|completed)\b/i.test(s)) return "success";
    if (/\b(?:deprecated)\b/i.test(s)) return "reminder";
    if (/\?{3,}|TODO|FIXME/i.test(s)) return "reminder";
    return "other";
  }

  const WEEKDAY_ZH = [
    "星期日",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
  ];

  function formatDayTitleZh(d) {
    return (
      (d.getMonth() + 1) +
      "月" +
      d.getDate() +
      "日 " +
      WEEKDAY_ZH[d.getDay()]
    );
  }

  const STAT_LABEL_ZH = {
    error: "错误",
    warning: "警告",
    info: "信息",
    debug: "调试",
    success: "成功",
    lifecycle: "运行",
    reminder: "提醒",
    other: "其他",
  };

  const STAT_ORDER = [
    "error",
    "warning",
    "info",
    "debug",
    "success",
    "lifecycle",
    "reminder",
    "other",
  ];

  function formatDayStatsZh(stats) {
    const parts = [];
    for (let i = 0; i < STAT_ORDER.length; i++) {
      const k = STAT_ORDER[i];
      const n = stats[k] || 0;
      if (n > 0) {
        let label = STAT_LABEL_ZH[k];
        if (k === "error") {
          label = "🚨 " + label;
        } else if (k === "warning") {
          label = "⚠️ " + label;
        }
        parts.push(label + " " + n);
      }
    }
    return parts.length ? parts.join(" · ") : "无分类统计";
  }

  function emptyStats() {
    return {
      error: 0,
      warning: 0,
      info: 0,
      debug: 0,
      success: 0,
      lifecycle: 0,
      reminder: 0,
      other: 0,
    };
  }

  function emojiForLogLine(line) {
    const s = String(line);
    const t = s.trim();
    if (!t) return "⬜";
    if (/^\[[…]/.test(t) || /^\[\.\.\./.test(t)) return "📎";
    if (/traceback|exception|\bfatal\b|\bcritical\b|\berror\b|errno\s+/i.test(s))
      return "🚨";
    if (/\bwarn(?:ing)?\b|\] warn\b/i.test(s)) return "⚠️";
    if (/\bdebug\b/i.test(s)) return "🐛";
    if (/\binfo\b|\] info\b/i.test(s)) return "ℹ️";
    if (
      /\b(?:listening|started|running|ready)\b/i.test(s) &&
      !/\berror\b/i.test(s)
    )
      return "🚀";
    if (/\b(?:shutdown|stopped|terminated|killed)\b/i.test(s)) return "🛑";
    if (/\s5\d{2}(\s|$|,)/.test(s) || /" 5\d{2} /.test(s)) return "🔥";
    if (/\s4\d{2}(\s|$|,)/.test(s) || /" 4\d{2} /.test(s)) return "🚧";
    if (/\s2\d{2}(\s|$|,)/.test(s) || /\b200 ok\b/i.test(s)) return "✅";
    if (/\b(?:success|succeeded|completed)\b/i.test(s)) return "✔️";
    if (/\b(?:deprecated)\b/i.test(s)) return "📜";
    if (/\?{3,}|TODO|FIXME/i.test(s)) return "❓";
    return "📌";
  }

  function setTimelineLoading(title) {
    timelineTitleEl.textContent = title || "Timeline";
    timelineMetaEl.hidden = true;
    timelinePlaceholderEl.hidden = true;
    timelineChartEl.hidden = false;
    timelineChartEl.innerHTML = "";
    const p = document.createElement("p");
    p.className = "timeline-loading";
    p.textContent = "Loading…";
    timelineChartEl.appendChild(p);
  }

  function setTimelineEmpty() {
    selectedItemEl = null;
    timelineTitleEl.textContent = "Timeline";
    timelineMetaEl.hidden = true;
    timelineMetaEl.textContent = "";
    timelinePlaceholderEl.hidden = false;
    timelineChartEl.hidden = true;
    timelineChartEl.innerHTML = "";
    document.querySelectorAll(".log-list__item--active").forEach(function (el) {
      el.classList.remove("log-list__item--active");
    });
  }

  function renderTimeline(name, data) {
    timelineTitleEl.textContent = name;
    const metaParts = [formatBytes(data.size)];
    if (data.truncated) metaParts.push("truncated tail only");
    timelineMetaEl.textContent = metaParts.join(" · ");
    timelineMetaEl.hidden = false;
    timelinePlaceholderEl.hidden = true;
    timelineChartEl.hidden = false;
    timelineChartEl.innerHTML = "";

    const raw = String(data.content || "");
    const lines = raw.split(/\r?\n/);
    const forward = [];
    let lastKey = null;
    let lastDate = null;
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      if (!text.trim()) continue;
      const parsed = extractDateAndRest(text);
      let key;
      let label;
      let dateObj;
      let body;
      if (parsed) {
        key = parsed.key;
        label = parsed.label;
        dateObj = parsed.date;
        lastKey = key;
        lastDate = dateObj;
        const rest = parsed.rest.trim();
        body = rest.length ? rest : text;
      } else {
        key = lastKey;
        label = lastKey ? lastKey : "—";
        dateObj = lastDate;
        body = text;
      }
      forward.push({
        body: body,
        key: key,
        label: label,
        dateObj: dateObj,
        emoji: emojiForLogLine(text),
        statKind: statKindForLine(text),
      });
    }
    const display = forward.slice().reverse();

    const keyOrder = [];
    for (let j = 0; j < display.length; j++) {
      const k = display[j].key;
      if (k && keyOrder.indexOf(k) === -1) {
        keyOrder.push(k);
      }
    }

    const groups = [];
    for (let j = 0; j < display.length; j++) {
      const ev = display[j];
      const gk = ev.key || "__nodate__";
      if (
        !groups.length ||
        groups[groups.length - 1].gateKey !== gk
      ) {
        groups.push({
          gateKey: gk,
          key: ev.key,
          dateObj: ev.dateObj,
          items: [],
          stats: emptyStats(),
        });
      }
      const g = groups[groups.length - 1];
      g.items.push(ev);
      const sk = ev.statKind || "other";
      g.stats[sk] = (g.stats[sk] || 0) + 1;
    }

    let weekendHeaderStripe = 0;
    let weekdayHeaderStripe = 0;

    const hasNodate = display.some(function (ev) {
      return !ev.key;
    });

    const ul = document.createElement("ul");
    ul.className = "timeline-list";
    if (display.length && !hasNodate) {
      ul.classList.add("timeline-list--dated-only");
    } else if (display.length) {
      ul.classList.add("timeline-list--has-nodate");
    }

    function appendDayHeader(group) {
      const headerLi = document.createElement("li");
      headerLi.className = "timeline-day-header";
      headerLi.setAttribute("role", "presentation");
      headerLi.dataset.timelineDay = group.key ? group.key : "__nodate__";
      let titleZh;
      if (!group.key) {
        titleZh = "无日期";
        headerLi.classList.add("timeline-day-header--nodate");
        headerLi.classList.add(
          "timeline-day-header--weekday",
        );
        headerLi.classList.add(
          "timeline-day-header--stripe-" +
            (weekdayHeaderStripe % 2 === 0 ? "a" : "b"),
        );
        weekdayHeaderStripe++;
      } else if (
        group.dateObj &&
        !isNaN(group.dateObj.getTime())
      ) {
        titleZh = formatDayTitleZh(group.dateObj);
        const wk =
          group.dateObj.getDay() === 0 ||
          group.dateObj.getDay() === 6;
        if (wk) {
          headerLi.classList.add("timeline-day-header--weekend");
          headerLi.classList.add(
            "timeline-day-header--gray-" +
              (weekendHeaderStripe % 2 === 0 ? "a" : "b"),
          );
          weekendHeaderStripe++;
        } else {
          headerLi.classList.add("timeline-day-header--weekday");
          headerLi.classList.add(
            "timeline-day-header--stripe-" +
              (weekdayHeaderStripe % 2 === 0 ? "a" : "b"),
          );
          weekdayHeaderStripe++;
        }
      } else {
        titleZh = group.key || "—";
        headerLi.classList.add("timeline-day-header--weekday");
        headerLi.classList.add(
          "timeline-day-header--stripe-" +
            (weekdayHeaderStripe % 2 === 0 ? "a" : "b"),
        );
        weekdayHeaderStripe++;
      }

      const row = document.createElement("div");
      row.className = "timeline-day-header__row";
      const dateIcon = document.createElement("span");
      dateIcon.className = "timeline-day-header__date-ico";
      dateIcon.setAttribute("aria-hidden", "true");
      dateIcon.textContent = group.key ? "📅" : "📋";
      const titleSpan = document.createElement("span");
      titleSpan.className = "timeline-day-header__title";
      titleSpan.textContent = titleZh;
      const statsSpan = document.createElement("span");
      statsSpan.className = "timeline-day-header__stats";
      statsSpan.textContent = formatDayStatsZh(group.stats);
      row.appendChild(dateIcon);
      row.appendChild(titleSpan);
      row.appendChild(statsSpan);
      headerLi.appendChild(row);
      ul.appendChild(headerLi);
    }

    for (let gi = 0; gi < groups.length; gi++) {
      appendDayHeader(groups[gi]);
      const items = groups[gi].items;
      for (let ii = 0; ii < items.length; ii++) {
        const ev = items[ii];
        const li = document.createElement("li");
        let band = 0;
        if (ev.key) {
          band = keyOrder.indexOf(ev.key) % 2;
        }
        const weekend =
          ev.dateObj &&
          !isNaN(ev.dateObj.getTime()) &&
          (ev.dateObj.getDay() === 0 || ev.dateObj.getDay() === 6);
        let cls =
          "timeline-item timeline-item--band-" + (band === 0 ? "a" : "b");
        if (weekend) {
          cls += " timeline-item--weekend";
        }
        if (!ev.key) {
          cls = "timeline-item timeline-item--nodate";
        }
        li.className = cls;
        if (
          ev.dateObj &&
          !isNaN(ev.dateObj.getTime()) &&
          ev.key
        ) {
          li.dataset.timelineYmd = ymdFromLocalDate(ev.dateObj);
          li.dataset.timelineHour = String(ev.dateObj.getHours());
        }

        const marker = document.createElement("span");
        marker.className = "timeline-item__emoji";
        marker.setAttribute("aria-hidden", "true");
        marker.textContent = ev.emoji;
        const bodyWrap = document.createElement("div");
        bodyWrap.className = "timeline-item__body";
        const pre = document.createElement("pre");
        pre.className = "timeline-item__text";
        pre.textContent = ev.body;
        bodyWrap.appendChild(pre);
        if (hasNodate) {
          const dateEl = document.createElement("time");
          dateEl.className = "timeline-item__date";
          if (ev.key) {
            dateEl.classList.add("timeline-item__date--blank");
            dateEl.setAttribute("datetime", ev.key);
            dateEl.textContent = "";
            dateEl.setAttribute("aria-hidden", "true");
          } else {
            dateEl.textContent = ev.label;
          }
          li.appendChild(dateEl);
        }
        li.appendChild(marker);
        li.appendChild(bodyWrap);
        ul.appendChild(li);
      }
    }
    if (display.length === 0) {
      const empty = document.createElement("p");
      empty.className = "timeline-empty";
      empty.textContent = "No non-empty lines in this file.";
      timelineChartEl.appendChild(empty);
    } else {
      timelineChartEl.appendChild(ul);
    }
  }

  async function selectLogForTimeline(name, itemEl) {
    if (!name) return;
    clearPickedMicroCellsExceptRow(itemEl);
    if (selectedItemEl && selectedItemEl !== itemEl) {
      selectedItemEl.classList.remove("log-list__item--active");
    }
    selectedItemEl = itemEl;
    itemEl.classList.add("log-list__item--active");
    setTimelineLoading(name);
    showError("");
    try {
      const data = await fetchJson(
        "/api/logs/" + encodeURIComponent(name)
      );
      renderTimeline(name, data);
    } catch (e) {
      timelineChartEl.innerHTML = "";
      const p = document.createElement("p");
      p.className = "timeline-error";
      p.textContent = "Failed to load log: " + e.message;
      timelineChartEl.appendChild(p);
      showError("");
      throw e;
    }
  }

  function scrollTimelineToDayKey(ymd) {
    const root = timelineChartEl;
    if (!root || root.hidden) return;
    const sel = '[data-timeline-day="' + String(ymd).replace(/"/g, "") + '"]';
    const target = root.querySelector(sel);
    if (!target) return;
    target.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function scrollTimelineToDayHour(ymd, hour) {
    const root = timelineChartEl;
    if (!root || root.hidden) return;
    const y = String(ymd).replace(/"/g, "");
    const h = String(hour);
    const target = root.querySelector(
      '.timeline-item[data-timeline-ymd="' +
        y +
        '"][data-timeline-hour="' +
        h +
        '"]',
    );
    if (target) {
      target.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    scrollTimelineToDayKey(ymd);
  }

  async function drillTimelineToDate(name, ymd, itemLi, pickedCell) {
    markPickedDayDrill(pickedCell);
    try {
      const needLoad = selectedItemEl !== itemLi;
      if (needLoad) {
        await selectLogForTimeline(name, itemLi);
      }
      requestAnimationFrame(function () {
        scrollTimelineToDayKey(ymd);
      });
    } catch (e) {
      /* ⬅️ Error banner already shown by selectLogForTimeline */
    }
  }

  async function drillTimelineToTodayHour(name, ymd, hour, itemLi, pickedCell) {
    markPickedHourDrill(pickedCell, ymd);
    try {
      const needLoad = selectedItemEl !== itemLi;
      if (needLoad) {
        await selectLogForTimeline(name, itemLi);
      }
      requestAnimationFrame(function () {
        scrollTimelineToDayHour(ymd, hour);
      });
    } catch (e) {
      /* ⬅️ Error banner already shown by selectLogForTimeline */
    }
  }

  async function loadFileList() {
    showError("");
    listEl.innerHTML = "";
    setTimelineEmpty();
    emptyEl.hidden = true;
    legendEl.hidden = true;
    try {
      const todayYmd = localDateYmd();
      const [data, hourlyData] = await Promise.all([
        fetchJson("/api/logs"),
        fetchJson(
          "/api/logs/hourly-summary?date=" + encodeURIComponent(todayYmd),
        ).catch(function () {
          return { files: [] };
        }),
      ]);
      rootEl.textContent = "Directory: " + data.root;
      rootEl.hidden = false;
      const files = data.files || [];
      if (files.length === 0) {
        emptyEl.hidden = false;
        return;
      }
      const hourlyByName = {};
      const hfiles = hourlyData.files || [];
      for (let hi = 0; hi < hfiles.length; hi++) {
        const he = hfiles[hi];
        if (he && he.name && Array.isArray(he.hours)) {
          hourlyByName[he.name] = {
            hours: he.hours,
            days24:
              he.days24 && Array.isArray(he.days24) && he.days24.length === 24
                ? he.days24
                : null,
          };
        }
      }
      const nowHour = new Date().getHours();
      const anyIssues = files.some(function (f) {
        const e = Number(f.error_count) || 0;
        const w = Number(f.warning_count) || 0;
        return e > 0 || w > 0;
      });
      legendEl.hidden = !anyIssues;
      for (const item of files) {
        const li = document.createElement("li");
        li.className = "log-list__item";
        const col = document.createElement("div");
        col.className = "log-list__col";
        const main = document.createElement("div");
        main.className = "log-list__main";
        main.setAttribute("role", "button");
        main.setAttribute("tabindex", "0");
        const name =
          typeof item === "string" ? item : (item && item.name) || "";
        main.dataset.name = name;
        const errN =
          typeof item === "object" && item.error_count != null
            ? Number(item.error_count)
            : item.issues && item.issues.includes("error")
              ? 1
              : 0;
        const warnN =
          typeof item === "object" && item.warning_count != null
            ? Number(item.warning_count)
            : item.issues && item.issues.includes("warning")
              ? 1
              : 0;
        main.setAttribute("aria-label", rowAriaLabel(name, errN, warnN));

        const appEl = document.createElement("span");
        appEl.className = "log-list__app";
        appEl.setAttribute("aria-hidden", "true");
        appEl.textContent = appEmojiForLogName(name);
        appEl.title = "Inferred from file name";

        const text = document.createElement("span");
        text.className = "log-list__name";
        text.textContent = name;

        main.appendChild(appEl);
        main.appendChild(text);
        const summary = buildIssueSummary(errN, warnN);
        if (summary) {
          main.appendChild(summary);
        }

        const orig = document.createElement("a");
        orig.className = "log-list__original";
        orig.href = "view.html?name=" + encodeURIComponent(name);
        orig.textContent = "原文";
        orig.title = "Open full log text";
        orig.setAttribute("aria-label", "Open original full text: " + name);

        function activateTimeline() {
          selectLogForTimeline(name, li);
        }
        main.addEventListener("click", function (e) {
          e.preventDefault();
          activateTimeline();
        });
        main.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activateTimeline();
          }
        });

        col.appendChild(main);
        const health = hourlyByName[name];
        const hoursOk =
          health &&
          Array.isArray(health.hours) &&
          health.hours.length === 24;
        const daysOk =
          health &&
          Array.isArray(health.days24) &&
          health.days24.length === 24;

        const hourDrillCtx = {
          logName: name,
          itemLi: li,
          todayYmd: todayYmd,
        };
        if (hoursOk) {
          col.appendChild(
            buildTodayHourStrip(
              health.hours,
              nowHour,
              todayYmd,
              hourDrillCtx,
            ),
          );
        } else {
          const emptyHrs = [];
          for (let z = 0; z < 24; z++) {
            emptyHrs.push("empty");
          }
          const strip = buildTodayHourStrip(
            emptyHrs,
            nowHour,
            todayYmd,
            hourDrillCtx,
          );
          strip.classList.add("log-list__hourly--unavailable");
          col.appendChild(strip);
        }

        const dayDrillCtx = { logName: name, itemLi: li };
        if (daysOk) {
          col.appendChild(
            buildRecentDaysStrip(health.days24, todayYmd, dayDrillCtx),
          );
        } else {
          const emptyDays = [];
          for (let z = 0; z < 24; z++) {
            emptyDays.push("empty");
          }
          const dStrip = buildRecentDaysStrip(
            emptyDays,
            todayYmd,
            dayDrillCtx,
          );
          dStrip.classList.add("log-list__hourly--unavailable");
          col.appendChild(dStrip);
        }

        li.appendChild(col);
        li.appendChild(orig);
        listEl.appendChild(li);
      }
    } catch (e) {
      showError("Failed to load log list: " + e.message);
      emptyEl.hidden = false;
      setTimelineEmpty();
    }
  }

  loadFileList();
})();
