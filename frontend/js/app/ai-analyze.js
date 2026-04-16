import { fetchJson, postJsonAnalyzed } from "./api.js";

const SKILL_USAGE_FOOTER_RE = /\n\n---\n(\*\*技能使用情况（Skill usage）[:：]\*\*[\s\S]*)$/;

const PATH_PRESETS = "/analyze-presets";
const PATH_ANALYZE = "/analyze";
const KEY_PRESET = "preset";
const TOK_SUFFIX = " tok)";

function logApiPath(name, suffix) {
  return "/api/logs/" + encodeURIComponent(name) + suffix;
}

export function fetchAnalyzePresets(name) {
  return fetchJson(logApiPath(name, PATH_PRESETS));
}

export function postLogAnalyze(name, presetId) {
  const url = logApiPath(name, PATH_ANALYZE);
  return postJsonAnalyzed(url, { [KEY_PRESET]: presetId });
}

/**
 * @param {HTMLSelectElement} selectEl
 * @param {Array<{ id: string, label: string, approx_tokens?: number }>} presets
 */
/**
 * Extracts the skill-usage appendix from ai-api `/analyze-log` (after `---`).
 * @param {string} text
 * @returns {string}
 */
export function extractSkillUsageFooter(text) {
  if (typeof text !== "string" || !text) {
    return "";
  }
  const m = text.match(SKILL_USAGE_FOOTER_RE);
  return m ? m[1].trim() : "";
}

/**
 * Fills the main `<pre>` with full analysis and optionally shows a duplicate skill-usage block below.
 * @param {HTMLElement | null} bodyEl
 * @param {HTMLElement | null} footerEl
 * @param {string} fullText
 */
export function renderAnalyzeResultWithSkillFooter(bodyEl, footerEl, fullText) {
  const t = typeof fullText === "string" ? fullText : "";
  if (bodyEl) {
    bodyEl.textContent = t;
  }
  if (!footerEl) {
    return;
  }
  const foot = extractSkillUsageFooter(t);
  if (foot) {
    footerEl.textContent = foot;
    footerEl.hidden = false;
  } else {
    footerEl.textContent = "";
    footerEl.hidden = true;
  }
}

/** @param {HTMLElement | null} footerEl */
export function clearAnalyzeSkillFooter(footerEl) {
  if (footerEl) {
    footerEl.textContent = "";
    footerEl.hidden = true;
  }
}

export function fillPresetSelect(selectEl, presets) {
  selectEl.innerHTML = "";
  for (let i = 0; i < presets.length; i++) {
    const row = presets[i];
    const opt = document.createElement("option");
    opt.value = row.id;
    const tok = row.approx_tokens;
    const extra =
      typeof tok === "number" ? " (~" + String(tok) + TOK_SUFFIX : "";
    opt.textContent = row.label + extra;
    selectEl.appendChild(opt);
  }
}
