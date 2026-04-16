import { fetchJson, postJsonAnalyzed } from "./api.js";

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
