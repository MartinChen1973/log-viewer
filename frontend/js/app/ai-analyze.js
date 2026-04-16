import { fetchJson, postJsonAnalyzed } from "./api.js";

const SKILL_USAGE_FOOTER_RE = /\n\n---\n(\*\*技能使用情况（Skill usage）[:：]\*\*[\s\S]*)$/;

const PATH_PRESETS = "/analyze-presets";
const PATH_ANALYZE = "/analyze";
const KEY_PRESET = "preset";
const TOK_SUFFIX = " tok)";

const FOOTER_STEPS_CLASS = "ai-analyze-result__skill-footer--steps";

/** @type {Record<string, string>} */
const KIND_LABEL = {
  skill: "技能",
  agent: "智能体",
  tool: "工具",
};

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
 * Removes the skill-usage appendix from analysis text (same block shown in the footer).
 * @param {string} text
 * @returns {string}
 */
export function stripSkillUsageAppendix(text) {
  if (typeof text !== "string" || !text) {
    return "";
  }
  return text.replace(SKILL_USAGE_FOOTER_RE, "").trimEnd();
}

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
 * @param {number | null | undefined} n
 * @returns {string}
 */
function formatTokenCell(n) {
  if (n == null || n === 0) {
    return "-";
  }
  return String(n);
}

/**
 * @param {number | null | undefined} n
 * @returns {string}
 */
function formatCostCell(n) {
  if (n == null || n === undefined) {
    return "-";
  }
  if (typeof n !== "number" || !Number.isFinite(n)) {
    return "-";
  }
  return "$" + n.toFixed(6);
}

/**
 * @param {number | null | undefined} n
 * @returns {string}
 */
function formatCnyCell(n) {
  if (n == null || n === undefined) {
    return "-";
  }
  if (typeof n !== "number" || !Number.isFinite(n)) {
    return "-";
  }
  return "¥" + n.toFixed(6);
}

/**
 * @param {number | null | undefined} n
 * @returns {string}
 */
function formatCnyPerMCell(n) {
  if (n == null || n === undefined) {
    return "-";
  }
  if (typeof n !== "number" || !Number.isFinite(n)) {
    return "-";
  }
  return String(n);
}

/**
 * @param {unknown} v
 * @returns {number | null}
 */
function coerceNumber(v) {
  if (v == null) {
    return null;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {HTMLElement} footerEl
 * @param {Array<{
 *   kind: string;
 *   name: string;
 *   tokens?: number | null;
 *   input_tokens?: number | null;
 *   output_tokens?: number | null;
 *   cost_usd?: number | null;
 *   price_input_cny_per_million?: number | null;
 *   price_output_cny_per_million?: number | null;
 *   estimated_cost_cny?: number | null;
 * }>} items
 */
function renderUsageItemsFooter(footerEl, items) {
  footerEl.textContent = "";
  footerEl.classList.add(FOOTER_STEPS_CLASS);

  const wrap = document.createElement("div");
  wrap.className = "ai-analyze-result__usage-wrap";

  const title = document.createElement("div");
  title.className = "ai-analyze-result__usage-title";
  title.textContent = "调用与消耗（分步）";
  wrap.appendChild(title);

  const hint = document.createElement("div");
  hint.className = "ai-analyze-result__usage-hint";
  hint.textContent =
    "入¥/M、出¥/M、预估(¥) 来自 AGICTO 公开列表价（缓存于 ai-api/data/model_prices.yaml）；与供应商实付可能不一致。";
  wrap.appendChild(hint);

  const table = document.createElement("table");
  table.className = "ai-analyze-result__usage-table";
  table.setAttribute("role", "table");
  table.setAttribute("aria-label", "Analysis invocation steps and token usage");

  const thead = document.createElement("thead");
  const headTr = document.createElement("tr");
  const headers = [
    "#",
    "类型",
    "说明",
    "输入",
    "输出",
    "总计",
    "费用 (USD)",
    "入¥/M",
    "出¥/M",
    "预估 (¥)",
  ];
  for (let h = 0; h < headers.length; h++) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = headers[h];
    headTr.appendChild(th);
  }
  thead.appendChild(headTr);
  table.appendChild(thead);

  let sumIn = 0;
  let sumOut = 0;
  let sumTot = 0;
  let sumCost = 0;
  let sumEstCny = 0;
  let countedAgent = 0;
  let catalogIn = null;
  let catalogOut = null;

  const tbody = document.createElement("tbody");
  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    const kind = typeof row.kind === "string" ? row.kind : "";
    const tr = document.createElement("tr");

    const tdNum = document.createElement("td");
    tdNum.className = "ai-analyze-result__usage-col-num";
    tdNum.textContent = String(i + 1);

    const tdKind = document.createElement("td");
    tdKind.className = "ai-analyze-result__usage-col-kind";
    tdKind.textContent = KIND_LABEL[kind] || kind || "—";

    const tdName = document.createElement("td");
    tdName.className = "ai-analyze-result__usage-col-name";
    tdName.textContent = typeof row.name === "string" ? row.name : "—";

    const tdIn = document.createElement("td");
    tdIn.className = "ai-analyze-result__usage-col-metric";
    const tdOut = document.createElement("td");
    tdOut.className = "ai-analyze-result__usage-col-metric";
    const tdTot = document.createElement("td");
    tdTot.className = "ai-analyze-result__usage-col-metric";
    const tdCost = document.createElement("td");
    tdCost.className = "ai-analyze-result__usage-col-cost";
    const tdPin = document.createElement("td");
    tdPin.className = "ai-analyze-result__usage-col-metric ai-analyze-result__usage-col-agicto";
    const tdPout = document.createElement("td");
    tdPout.className = "ai-analyze-result__usage-col-metric ai-analyze-result__usage-col-agicto";
    const tdEst = document.createElement("td");
    tdEst.className = "ai-analyze-result__usage-col-metric ai-analyze-result__usage-col-cny-est";

    if (kind === "agent") {
      const inn = coerceNumber(row.input_tokens);
      const outt = coerceNumber(row.output_tokens);
      const tot = coerceNumber(row.tokens);
      const cost = coerceNumber(row.cost_usd);
      const pin = coerceNumber(row.price_input_cny_per_million);
      const pout = coerceNumber(row.price_output_cny_per_million);
      const est = coerceNumber(row.estimated_cost_cny);
      tdIn.textContent = formatTokenCell(inn);
      tdOut.textContent = formatTokenCell(outt);
      tdTot.textContent = formatTokenCell(tot);
      tdCost.textContent = formatCostCell(cost);
      tdPin.textContent = formatCnyPerMCell(pin);
      tdPout.textContent = formatCnyPerMCell(pout);
      tdEst.textContent = formatCnyCell(est);
      if (catalogIn == null && pin != null) {
        catalogIn = pin;
      }
      if (catalogOut == null && pout != null) {
        catalogOut = pout;
      }
      if (inn != null) {
        sumIn += inn;
      }
      if (outt != null) {
        sumOut += outt;
      }
      if (tot != null) {
        sumTot += tot;
      }
      if (cost != null) {
        sumCost += cost;
      }
      if (est != null) {
        sumEstCny += est;
      }
      countedAgent += 1;
    } else {
      tdIn.textContent = "-";
      tdOut.textContent = "-";
      tdTot.textContent = "-";
      tdCost.textContent = "-";
      tdPin.textContent = "-";
      tdPout.textContent = "-";
      tdEst.textContent = "-";
    }

    tr.appendChild(tdNum);
    tr.appendChild(tdKind);
    tr.appendChild(tdName);
    tr.appendChild(tdIn);
    tr.appendChild(tdOut);
    tr.appendChild(tdTot);
    tr.appendChild(tdCost);
    tr.appendChild(tdPin);
    tr.appendChild(tdPout);
    tr.appendChild(tdEst);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  if (items.length > 0) {
    const tfoot = document.createElement("tfoot");
    const footTr = document.createElement("tr");
    footTr.className = "ai-analyze-result__usage-foot";

    const tdLabel = document.createElement("td");
    tdLabel.colSpan = 3;
    tdLabel.className = "ai-analyze-result__usage-foot-label";
    tdLabel.textContent =
      countedAgent > 0 ? "合计（智能体行）" : "合计";

    const fIn = document.createElement("td");
    fIn.className = "ai-analyze-result__usage-col-metric";
    fIn.textContent =
      countedAgent > 0 && sumIn > 0 ? String(sumIn) : "-";
    const fOut = document.createElement("td");
    fOut.className = "ai-analyze-result__usage-col-metric";
    fOut.textContent =
      countedAgent > 0 && sumOut > 0 ? String(sumOut) : "-";
    const fTot = document.createElement("td");
    fTot.className = "ai-analyze-result__usage-col-metric";
    fTot.textContent =
      countedAgent > 0 && sumTot > 0 ? String(sumTot) : "-";
    const fCost = document.createElement("td");
    fCost.className = "ai-analyze-result__usage-col-cost";
    fCost.textContent =
      countedAgent > 0 && sumCost > 0 ? formatCostCell(sumCost) : "-";
    const fPin = document.createElement("td");
    fPin.className = "ai-analyze-result__usage-col-metric ai-analyze-result__usage-col-agicto";
    fPin.textContent =
      catalogIn != null ? formatCnyPerMCell(catalogIn) : "-";
    const fPout = document.createElement("td");
    fPout.className = "ai-analyze-result__usage-col-metric ai-analyze-result__usage-col-agicto";
    fPout.textContent =
      catalogOut != null ? formatCnyPerMCell(catalogOut) : "-";
    const fEst = document.createElement("td");
    fEst.className = "ai-analyze-result__usage-col-metric ai-analyze-result__usage-col-cny-est";
    fEst.textContent =
      countedAgent > 0 && sumEstCny > 0 ? formatCnyCell(sumEstCny) : "-";

    footTr.appendChild(tdLabel);
    footTr.appendChild(fIn);
    footTr.appendChild(fOut);
    footTr.appendChild(fTot);
    footTr.appendChild(fCost);
    footTr.appendChild(fPin);
    footTr.appendChild(fPout);
    footTr.appendChild(fEst);
    tfoot.appendChild(footTr);
    table.appendChild(tfoot);
  }

  wrap.appendChild(table);
  footerEl.appendChild(wrap);
  footerEl.hidden = false;
}

/**
 * @param {unknown} raw
 */
function normalizeUsageItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const o = raw[i];
    if (!o || typeof o !== "object") {
      continue;
    }
    const kind = o.kind;
    const name = o.name;
    if (typeof kind !== "string" || typeof name !== "string" || !name) {
      continue;
    }
    let tokens = o.tokens;
    if (tokens != null && typeof tokens !== "number") {
      const n = Number(tokens);
      tokens = Number.isFinite(n) ? n : null;
    }
    let input_tokens = o.input_tokens;
    if (input_tokens != null && typeof input_tokens !== "number") {
      const n = Number(input_tokens);
      input_tokens = Number.isFinite(n) ? n : null;
    }
    let output_tokens = o.output_tokens;
    if (output_tokens != null && typeof output_tokens !== "number") {
      const n = Number(output_tokens);
      output_tokens = Number.isFinite(n) ? n : null;
    }
    let cost_usd = o.cost_usd;
    if (cost_usd != null && typeof cost_usd !== "number") {
      const n = Number(cost_usd);
      cost_usd = Number.isFinite(n) ? n : null;
    }
    let price_input_cny_per_million = o.price_input_cny_per_million;
    if (price_input_cny_per_million != null && typeof price_input_cny_per_million !== "number") {
      const n = Number(price_input_cny_per_million);
      price_input_cny_per_million = Number.isFinite(n) ? n : null;
    }
    let price_output_cny_per_million = o.price_output_cny_per_million;
    if (
      price_output_cny_per_million != null &&
      typeof price_output_cny_per_million !== "number"
    ) {
      const n = Number(price_output_cny_per_million);
      price_output_cny_per_million = Number.isFinite(n) ? n : null;
    }
    let estimated_cost_cny = o.estimated_cost_cny;
    if (estimated_cost_cny != null && typeof estimated_cost_cny !== "number") {
      const n = Number(estimated_cost_cny);
      estimated_cost_cny = Number.isFinite(n) ? n : null;
    }
    out.push({
      kind,
      name,
      tokens,
      input_tokens,
      output_tokens,
      cost_usd,
      price_input_cny_per_million,
      price_output_cny_per_million,
      estimated_cost_cny,
    });
  }
  return out;
}

/**
 * Fills the main `<pre>` with analysis and the footer with usage rows or legacy skill text.
 * @param {HTMLElement | null} bodyEl
 * @param {HTMLElement | null} footerEl
 * @param {string} fullText
 * @param {unknown} [usageItemsRaw]
 */
export function renderAnalyzeResultWithSkillFooter(
  bodyEl,
  footerEl,
  fullText,
  usageItemsRaw,
) {
  const t = typeof fullText === "string" ? fullText : "";
  const usageItems = normalizeUsageItems(usageItemsRaw);

  if (bodyEl) {
    if (usageItems.length > 0) {
      bodyEl.textContent = stripSkillUsageAppendix(t);
    } else {
      bodyEl.textContent = t;
    }
  }
  if (!footerEl) {
    return;
  }
  if (usageItems.length > 0) {
    renderUsageItemsFooter(footerEl, usageItems);
    return;
  }
  footerEl.classList.remove(FOOTER_STEPS_CLASS);
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
    footerEl.innerHTML = "";
    footerEl.classList.remove(FOOTER_STEPS_CLASS);
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
