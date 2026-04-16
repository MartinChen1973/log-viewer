import { extractDateAndRest, ymdFromLocalDate } from "./date-parse.js";
import {
  emptyStats,
  emojiForLogLine,
  formatDayStatsZh,
  formatDayTitleZh,
  statKindForLine,
} from "./line-classify.js";
import { formatBytes } from "./format-utils.js";

/**
 * @typedef {object} TimelineElements
 * @property {HTMLElement} timelineTitleEl
 * @property {HTMLElement} timelineMetaEl
 * @property {HTMLElement} timelinePlaceholderEl
 * @property {HTMLElement} timelineChartEl
 */

/** @param {TimelineElements} els */
export function setTimelineLoading(els, title) {
  els.timelineTitleEl.textContent = title || "Timeline";
  els.timelineMetaEl.hidden = true;
  els.timelinePlaceholderEl.hidden = true;
  els.timelineChartEl.hidden = false;
  els.timelineChartEl.innerHTML = "";
  const p = document.createElement("p");
  p.className = "timeline-loading";
  p.textContent = "Loading…";
  els.timelineChartEl.appendChild(p);
}

// ## ⬇️ Clears selected list item ref in the app shell.
/**
 * @param {TimelineElements} els
 * @param {() => void} onClearSelection
 */
export function setTimelineEmpty(els, onClearSelection) {
  onClearSelection();
  els.timelineTitleEl.textContent = "Timeline";
  els.timelineMetaEl.hidden = true;
  els.timelineMetaEl.textContent = "";
  els.timelinePlaceholderEl.hidden = false;
  els.timelineChartEl.hidden = true;
  els.timelineChartEl.innerHTML = "";
  document.querySelectorAll(".log-list__item--active").forEach(function (el) {
    el.classList.remove("log-list__item--active");
  });
}

/** @param {TimelineElements} els */
export function renderTimeline(els, name, data) {
  els.timelineTitleEl.textContent = name;
  const metaParts = [formatBytes(data.size)];
  if (data.truncated) metaParts.push("truncated tail only");
  els.timelineMetaEl.textContent = metaParts.join(" · ");
  els.timelineMetaEl.hidden = false;
  els.timelinePlaceholderEl.hidden = true;
  els.timelineChartEl.hidden = false;
  els.timelineChartEl.innerHTML = "";

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
    els.timelineChartEl.appendChild(empty);
  } else {
    els.timelineChartEl.appendChild(ul);
  }
}

/** @param {TimelineElements} els */
export function scrollTimelineToDayKey(els, ymd) {
  const root = els.timelineChartEl;
  if (!root || root.hidden) return;
  const sel = '[data-timeline-day="' + String(ymd).replace(/"/g, "") + '"]';
  const target = root.querySelector(sel);
  if (!target) return;
  target.scrollIntoView({ block: "start", behavior: "smooth" });
}

/** @param {TimelineElements} els */
export function scrollTimelineToDayHour(els, ymd, hour) {
  const root = els.timelineChartEl;
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
  scrollTimelineToDayKey(els, ymd);
}
