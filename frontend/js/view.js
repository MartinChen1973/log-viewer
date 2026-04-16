import { fetchJson } from "./app/api.js";
import {
  clearAnalyzeSkillFooter,
  fetchAnalyzePresets,
  fillPresetSelect,
  postLogAnalyze,
  renderAnalyzeResultWithSkillFooter,
} from "./app/ai-analyze.js";

const BYTE_DIV_1024 = 1024;
const BYTE_DIV_MB = 1024 * 1024;

const params = new URLSearchParams(window.location.search);
const name = params.get("name");
const contentEl = document.getElementById("log-content");
const titleEl = document.getElementById("view-title");
const metaEl = document.getElementById("file-meta");
const errorEl = document.getElementById("error-banner");
const aiBarEl = document.getElementById("view-ai-analyze");
const aiSelectEl = document.getElementById("view-ai-preset");
const aiRunEl = document.getElementById("view-ai-run");
const aiResultEl = document.getElementById("view-ai-result");
const aiResultBodyEl = document.getElementById("view-ai-result-body");
const aiResultFooterEl = document.getElementById("view-ai-result-footer");
const aiCloseEl = document.getElementById("view-ai-close");

const MSG_ANALYZING = "正在分析…";
const MSG_EMPTY_ANALYSIS = "(无正文)";

let activeViewLogName = null;

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = !msg;
}

function formatBytes(n) {
  if (n < BYTE_DIV_1024) return n + " B";
  if (n < BYTE_DIV_MB) return (n / BYTE_DIV_1024).toFixed(1) + " KB";
  return (n / BYTE_DIV_MB).toFixed(1) + " MB";
}

function hideViewAi() {
  activeViewLogName = null;
  if (aiBarEl) aiBarEl.hidden = true;
  if (aiResultEl) aiResultEl.hidden = true;
  if (aiResultBodyEl) aiResultBodyEl.textContent = "";
  clearAnalyzeSkillFooter(aiResultFooterEl);
  if (aiRunEl) aiRunEl.disabled = false;
}

async function showViewAiForLog(fileName) {
  if (!aiBarEl || !aiSelectEl) return;
  try {
    const j = await fetchAnalyzePresets(fileName);
    fillPresetSelect(aiSelectEl, j.presets || []);
    aiBarEl.hidden = false;
  } catch {
    hideViewAi();
  }
}

function wireViewAiControls() {
  if (!aiRunEl || !aiCloseEl) return;
  aiCloseEl.addEventListener("click", function () {
    if (aiResultEl) aiResultEl.hidden = true;
  });
  aiRunEl.addEventListener("click", async function () {
    if (!activeViewLogName) return;
    const preset = aiSelectEl ? aiSelectEl.value : "";
    if (!preset) return;
    aiRunEl.disabled = true;
    if (aiResultEl) aiResultEl.hidden = false;
    clearAnalyzeSkillFooter(aiResultFooterEl);
    if (aiResultBodyEl) aiResultBodyEl.textContent = MSG_ANALYZING;
    try {
      const out = await postLogAnalyze(activeViewLogName, preset);
      if (!aiResultBodyEl) return;
      if (out.ok) {
        const raw = out.data && out.data.analysis;
        const text = typeof raw === "string" ? raw : "";
        const display = text.length ? text : MSG_EMPTY_ANALYSIS;
        renderAnalyzeResultWithSkillFooter(
          aiResultBodyEl,
          aiResultFooterEl,
          display,
        );
        return;
      }
      aiResultBodyEl.textContent = out.message || "(未知错误)";
      clearAnalyzeSkillFooter(aiResultFooterEl);
    } catch (e) {
      if (aiResultBodyEl) {
        aiResultBodyEl.textContent =
          "分析失败: " + ((e && e.message) || String(e));
      }
      clearAnalyzeSkillFooter(aiResultFooterEl);
    } finally {
      aiRunEl.disabled = false;
    }
  });
}

async function loadLog(fileName) {
  hideViewAi();
  if (!fileName) {
    contentEl.textContent = "Missing file name. Go back and pick a log file.";
    titleEl.textContent = "Log file";
    metaEl.hidden = true;
    return;
  }
  document.title = "Log viewer — " + fileName;
  titleEl.textContent = fileName;
  showError("");
  contentEl.textContent = "Loading…";
  metaEl.hidden = true;
  try {
    const data = await fetchJson(
      "/api/logs/" + encodeURIComponent(fileName),
    );
    const parts = [];
    parts.push(formatBytes(data.size));
    if (data.truncated) parts.push("truncated");
    metaEl.textContent = parts.join(" · ");
    metaEl.hidden = false;
    contentEl.textContent = data.content;
    activeViewLogName = fileName;
    await showViewAiForLog(fileName);
  } catch (e) {
    contentEl.textContent = "";
    showError("Failed to load log: " + e.message);
  }
}

wireViewAiControls();
loadLog(name);
