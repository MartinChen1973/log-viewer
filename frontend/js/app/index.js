import { fetchJson } from "./api.js";
import {
  fetchAnalyzePresets,
  fillPresetSelect,
  postLogAnalyze,
} from "./ai-analyze.js";
import { localDateYmd } from "./date-parse.js";
import {
  appEmojiForLogName,
  buildIssueSummary,
  rowAriaLabel,
} from "./list-row.js";
import {
  clearPickedMicroCellsExceptRow,
  markPickedDayDrill,
  markPickedHourDrill,
} from "./micro-pick.js";
import { buildRecentDaysStrip, buildTodayHourStrip } from "./strips.js";
import {
  renderTimeline,
  scrollTimelineToDayHour,
  scrollTimelineToDayKey,
  setTimelineEmpty,
  setTimelineLoading,
} from "./timeline.js";

const listEl = document.getElementById("log-list");
const rootEl = document.getElementById("log-root");
const errorEl = document.getElementById("error-banner");
const emptyEl = document.getElementById("list-empty");
const legendEl = document.getElementById("legend");
const timelineTitleEl = document.getElementById("timeline-title");
const timelineMetaEl = document.getElementById("timeline-meta");
const timelineChartEl = document.getElementById("timeline-chart");
const timelinePlaceholderEl = document.getElementById("timeline-placeholder");
const aiToolbarEl = document.getElementById("ai-analyze-toolbar");
const aiPresetSelectEl = document.getElementById("ai-preset-select");
const aiRunEl = document.getElementById("ai-analyze-run");
const aiResultEl = document.getElementById("ai-analyze-result");
const aiResultBodyEl = document.getElementById("ai-analyze-result-body");
const aiCloseEl = document.getElementById("ai-analyze-close");

const MSG_ANALYZING = "正在分析…";
const MSG_EMPTY_ANALYSIS = "(无正文)";

const timelineEls = {
  timelineTitleEl,
  timelineMetaEl,
  timelinePlaceholderEl,
  timelineChartEl,
};

let selectedItemEl = null;
let timelineLogName = null;

function hideAiAnalyzeUi() {
  timelineLogName = null;
  if (aiToolbarEl) aiToolbarEl.hidden = true;
  if (aiResultEl) aiResultEl.hidden = true;
  if (aiResultBodyEl) aiResultBodyEl.textContent = "";
  if (aiRunEl) aiRunEl.disabled = false;
}

function onClearSelectionAndAi() {
  clearSelectedItem();
  hideAiAnalyzeUi();
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = !msg;
}

function clearSelectedItem() {
  selectedItemEl = null;
}

async function syncAiPresetsForLog(name) {
  timelineLogName = name;
  if (!aiToolbarEl || !aiPresetSelectEl) return;
  try {
    const j = await fetchAnalyzePresets(name);
    const presets = j.presets || [];
    fillPresetSelect(aiPresetSelectEl, presets);
    aiToolbarEl.hidden = false;
  } catch {
    aiToolbarEl.hidden = true;
  }
}

async function selectLogForTimeline(name, itemEl) {
  if (!name) return;
  if (aiResultEl) aiResultEl.hidden = true;
  clearPickedMicroCellsExceptRow(listEl, itemEl);
  if (selectedItemEl && selectedItemEl !== itemEl) {
    selectedItemEl.classList.remove("log-list__item--active");
  }
  selectedItemEl = itemEl;
  itemEl.classList.add("log-list__item--active");
  setTimelineLoading(timelineEls, name);
  showError("");
  try {
    const data = await fetchJson(
      "/api/logs/" + encodeURIComponent(name),
    );
    renderTimeline(timelineEls, name, data);
    await syncAiPresetsForLog(name);
  } catch (e) {
    hideAiAnalyzeUi();
    timelineChartEl.innerHTML = "";
    const p = document.createElement("p");
    p.className = "timeline-error";
    p.textContent = "Failed to load log: " + e.message;
    timelineChartEl.appendChild(p);
    showError("");
    throw e;
  }
}

async function drillTimelineToDate(name, ymd, itemLi, pickedCell) {
  markPickedDayDrill(listEl, pickedCell);
  try {
    const needLoad = selectedItemEl !== itemLi;
    if (needLoad) {
      await selectLogForTimeline(name, itemLi);
    }
    requestAnimationFrame(function () {
      scrollTimelineToDayKey(timelineEls, ymd);
    });
  } catch {
    /* ⬅️ Error banner already shown by selectLogForTimeline */
  }
}

async function drillTimelineToTodayHour(name, ymd, hour, itemLi, pickedCell) {
  markPickedHourDrill(listEl, pickedCell, ymd);
  try {
    const needLoad = selectedItemEl !== itemLi;
    if (needLoad) {
      await selectLogForTimeline(name, itemLi);
    }
    requestAnimationFrame(function () {
      scrollTimelineToDayHour(timelineEls, ymd, hour);
    });
  } catch {
    /* ⬅️ Error banner already shown by selectLogForTimeline */
  }
}

async function loadFileList() {
  showError("");
  listEl.innerHTML = "";
  setTimelineEmpty(timelineEls, onClearSelectionAndAi);
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
            drillTimelineToTodayHour,
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
          drillTimelineToTodayHour,
        );
        strip.classList.add("log-list__hourly--unavailable");
        col.appendChild(strip);
      }

      const dayDrillCtx = { logName: name, itemLi: li };
      if (daysOk) {
        col.appendChild(
          buildRecentDaysStrip(
            health.days24,
            todayYmd,
            dayDrillCtx,
            drillTimelineToDate,
          ),
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
          drillTimelineToDate,
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
    setTimelineEmpty(timelineEls, onClearSelectionAndAi);
  }
}

function bindAiAnalyzeControls() {
  if (!aiRunEl || !aiCloseEl) return;
  aiCloseEl.addEventListener("click", function () {
    if (aiResultEl) aiResultEl.hidden = true;
  });
  aiRunEl.addEventListener("click", async function () {
    if (!timelineLogName) return;
    const preset = aiPresetSelectEl ? aiPresetSelectEl.value : "";
    if (!preset) return;
    aiRunEl.disabled = true;
    if (aiResultEl) aiResultEl.hidden = false;
    if (aiResultBodyEl) aiResultBodyEl.textContent = MSG_ANALYZING;
    try {
      const out = await postLogAnalyze(timelineLogName, preset);
      if (!aiResultBodyEl) return;
      if (out.ok) {
        const raw = out.data && out.data.analysis;
        const text = typeof raw === "string" ? raw : "";
        aiResultBodyEl.textContent = text.length ? text : MSG_EMPTY_ANALYSIS;
        return;
      }
      aiResultBodyEl.textContent = out.message || "(未知错误)";
    } catch (e) {
      if (aiResultBodyEl) {
        aiResultBodyEl.textContent =
          "分析失败: " + ((e && e.message) || String(e));
      }
    } finally {
      aiRunEl.disabled = false;
    }
  });
}

bindAiAnalyzeControls();
loadFileList();
