import { pad2, dateAtOffsetFromEndYmd, ymdFromLocalDate } from "./date-parse.js";

/**
 * @param {function(string, string, number, HTMLElement, HTMLElement): void} onDrillHour
 */
export function buildTodayHourStrip(
  hours,
  currentHour,
  dateLabel,
  drillCtx,
  onDrillHour,
) {
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
      drillCtx.todayYmd &&
      onDrillHour
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
        void onDrillHour(logName, ymd, hour, rowLi, cell);
      });
      cell.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          ev.stopPropagation();
          void onDrillHour(logName, ymd, hour, rowLi, cell);
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

/**
 * @param {function(string, string, HTMLElement, HTMLElement): void} onDrillDate
 */
export function buildRecentDaysStrip(days24, endYmd, drillCtx, onDrillDate) {
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
    if (drillCtx && drillCtx.logName && drillCtx.itemLi && onDrillDate) {
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
        void onDrillDate(logName, ymd, rowLi, cell);
      });
      cell.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          ev.stopPropagation();
          void onDrillDate(logName, ymd, rowLi, cell);
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
