import { fetchJson } from "./api.js";
import {
  clearAnalyzeSkillFooter,
  renderAnalyzeResultWithSkillFooter,
} from "./ai-analyze.js";

const PATH_LIST = "/api/logs/analyze-history";
const PATH_DETAIL = "/api/logs/analyze-history/";

/** @type {Map<string, unknown>} */
const detailCache = new Map();

/**
 * Final estimated CNY for the list title (右对齐): `¥` + 3 decimals, or em dash.
 * @param {Record<string, unknown>} totals
 * @returns {string}
 */
function formatFinalPriceTitle(totals) {
  if (!totals || typeof totals !== "object") {
    return "—";
  }
  const counted = Number(totals.counted_agent) || 0;
  const sumEst = Number(totals.sum_est_cny);
  if (!totals.has_agent_steps || counted < 1) {
    return "—";
  }
  if (!Number.isFinite(sumEst) || sumEst <= 0) {
    return "—";
  }
  return "¥" + sumEst.toFixed(3);
}

/**
 * @param {number | null | undefined} n
 * @returns {string}
 */
function fmtCny3(n) {
  if (n == null || typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    return "—";
  }
  return "¥" + n.toFixed(3);
}

/**
 * @param {string | undefined} s
 * @param {string | undefined} e
 * @returns {boolean}
 */
function hasDateRange(s, e) {
  return (
    typeof s === "string" &&
    s.length > 0 &&
    typeof e === "string" &&
    e.length > 0
  );
}

/**
 * Structured metrics: intro line + 4-column table (计数项 / 输入 / 输出 / 总计).
 * @param {Record<string, unknown>} totals
 * @param {number | null} approxTokens
 * @param {string | undefined} rangeDateStart
 * @param {string | undefined} rangeDateEnd
 * @returns {HTMLElement}
 */
function buildTotalsParamsEl(
  totals,
  approxTokens,
  rangeDateStart,
  rangeDateEnd,
) {
  const wrap = document.createElement("div");
  wrap.className = "analyze-history-list__params";

  const t = totals && typeof totals === "object" ? totals : {};
  const has = Boolean(t.has_agent_steps);
  const counted = Number(t.counted_agent) || 0;

  if (approxTokens != null && Number.isFinite(approxTokens)) {
    const intro = document.createElement("div");
    intro.className = "analyze-history-list__metric-intro";
    if (hasDateRange(rangeDateStart, rangeDateEnd)) {
      intro.textContent =
        rangeDateStart +
        "~" +
        rangeDateEnd +
        " 约" +
        String(approxTokens) +
        "tok";
    } else {
      intro.textContent = "所选日志片段 约 " + String(approxTokens) + " tok";
    }
    wrap.appendChild(intro);
  }

  if (!has || counted < 1) {
    const row = document.createElement("div");
    row.className = "analyze-history-list__param-line--muted";
    row.textContent = "无智能体用量明细";
    wrap.appendChild(row);
    return wrap;
  }

  const sumIn = Number(t.sum_in) || 0;
  const sumOut = Number(t.sum_out) || 0;
  const sumTot = Number(t.sum_tot) || 0;
  const sumEstAll = Number(t.sum_est_cny);
  const pin =
    typeof t.catalog_in_cny_per_m === "number"
      ? t.catalog_in_cny_per_m
      : null;
  const pout =
    typeof t.catalog_out_cny_per_m === "number"
      ? t.catalog_out_cny_per_m
      : null;

  const estIn =
    pin != null && sumIn > 0 ? (sumIn / 1e6) * pin : null;
  const estOut =
    pout != null && sumOut > 0 ? (sumOut / 1e6) * pout : null;
  let estGrand = null;
  if (Number.isFinite(sumEstAll) && sumEstAll > 0) {
    estGrand = sumEstAll;
  } else if (
    estIn != null &&
    estOut != null &&
    Number.isFinite(estIn) &&
    Number.isFinite(estOut)
  ) {
    estGrand = estIn + estOut;
  } else if (estIn != null && Number.isFinite(estIn)) {
    estGrand = estIn;
  } else if (estOut != null && Number.isFinite(estOut)) {
    estGrand = estOut;
  }

  const table = document.createElement("div");
  table.className = "analyze-history-list__metric-table";

  function addRow(rowClass, cells) {
    const row = document.createElement("div");
    row.className = ["analyze-history-list__metric-row", rowClass]
      .filter(Boolean)
      .join(" ");
    for (let i = 0; i < cells.length; i++) {
      const cell = document.createElement("span");
      cell.className = "analyze-history-list__metric-cell";
      cell.textContent = cells[i];
      row.appendChild(cell);
    }
    table.appendChild(row);
  }

  addRow("analyze-history-list__metric-row--head", [
    "计数项",
    "输入",
    "输出",
    "总计",
  ]);
  addRow("analyze-history-list__metric-row--tokens", [
    "token",
    sumIn > 0 ? String(sumIn) : "—",
    sumOut > 0 ? String(sumOut) : "—",
    sumTot > 0 ? String(sumTot) : "—",
  ]);

  const fmtUnit = (n) =>
    typeof n === "number" && Number.isFinite(n) ? String(n) + "¥/M" : "—";
  addRow("analyze-history-list__metric-row--unit", [
    "单价",
    fmtUnit(pin),
    fmtUnit(pout),
    "—",
  ]);

  addRow("analyze-history-list__metric-row--total-cn", [
    "总价",
    fmtCny3(estIn),
    fmtCny3(estOut),
    fmtCny3(estGrand),
  ]);

  wrap.appendChild(table);
  return wrap;
}

/**
 * @param {string | undefined} iso
 * @returns {string}
 */
function formatWhen(iso) {
  if (typeof iso !== "string" || !iso) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

/**
 * @param {HTMLElement} bodyEl
 * @param {HTMLElement} footEl
 * @param {HTMLElement | null} metaEl
 * @param {{ ok: boolean, data?: unknown, message?: string }} out
 */
function renderDetail(bodyEl, footEl, metaEl, out) {
  if (!out.ok || !out.data) {
    bodyEl.textContent = out.message || "加载失败";
    clearAnalyzeSkillFooter(footEl);
    if (metaEl) {
      metaEl.textContent = "";
    }
    return;
  }
  const data = out.data;
  if (metaEl) {
    const logName =
      typeof data.log_name === "string" ? data.log_name : "—";
    const presetLabel =
      typeof data.preset_label === "string"
        ? data.preset_label
        : String(data.preset || "");
    const rs = data.range_date_start;
    const re = data.range_date_end;
    const rangeSeg =
      hasDateRange(
        typeof rs === "string" ? rs : "",
        typeof re === "string" ? re : "",
      )
        ? rs + "~" + re
        : "";
    const when = formatWhen(
      typeof data.created_at === "string" ? data.created_at : "",
    );
    metaEl.textContent =
      logName +
      " · " +
      (presetLabel || "—") +
      (rangeSeg ? " · " + rangeSeg : "") +
      (when ? " · " + when : "");
  }
  const raw =
    typeof data.analysis === "string" ? data.analysis : "";
  const display = raw.length ? raw : "（无正文）";
  renderAnalyzeResultWithSkillFooter(
    bodyEl,
    footEl,
    display,
    data.usage_items,
  );
}

/**
 * Full-page `analyze-history.html`: list left, content right; optional `#<id>` in URL.
 */
export function initAnalyzeHistoryPage() {
  const listUl = document.getElementById("ah-page-list");
  const listEmpty = document.getElementById("ah-page-empty");
  const bodyEl = document.getElementById("ah-page-body");
  const footEl = document.getElementById("ah-page-footer");
  const metaEl = document.getElementById("ah-page-meta");

  if (!listUl || !listEmpty || !bodyEl || !footEl) {
    return;
  }

  let selectedLi = null;

  function setHash(id) {
    const h = "#" + id;
    if (history.replaceState) {
      history.replaceState(null, "", h);
    } else {
      location.hash = h;
    }
  }

  function clearSelectionClass() {
    if (selectedLi) {
      selectedLi.classList.remove("analyze-history-list__item--active");
      selectedLi = null;
    }
  }

  function selectRow(li) {
    clearSelectionClass();
    selectedLi = li;
    li.classList.add("analyze-history-list__item--active");
  }

  function loadDetail(id) {
    if (detailCache.has(id)) {
      renderDetail(bodyEl, footEl, metaEl, {
        ok: true,
        data: detailCache.get(id),
      });
      return;
    }
    bodyEl.textContent = "加载中…";
    clearAnalyzeSkillFooter(footEl);
    if (metaEl) {
      metaEl.textContent = "";
    }
    fetch(PATH_DETAIL + encodeURIComponent(id))
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data, status: res.status };
        });
      })
      .then(function (r) {
        if (r.ok) {
          detailCache.set(id, r.data);
          renderDetail(bodyEl, footEl, metaEl, { ok: true, data: r.data });
        } else {
          const msg =
            (r.data &&
              typeof r.data.error === "string" &&
              r.data.error) ||
            "加载失败 (" + String(r.status) + ")";
          renderDetail(bodyEl, footEl, metaEl, { ok: false, message: msg });
        }
      })
      .catch(function (err) {
        renderDetail(bodyEl, footEl, metaEl, {
          ok: false,
          message: (err && err.message) || String(err),
        });
      });
  }

  function activateEntry(id, li) {
    selectRow(li);
    setHash(id);
    loadDetail(id);
  }

  function findRowById(id) {
    const nodes = listUl.querySelectorAll(
      ".analyze-history-list__item[data-id]",
    );
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (el.getAttribute("data-id") === id) {
        return el;
      }
    }
    return null;
  }

  fetchJson(PATH_LIST)
    .then(function (data) {
      listUl.innerHTML = "";
      const entries = (data && data.entries) || [];
      if (!Array.isArray(entries) || entries.length === 0) {
        listEmpty.hidden = false;
        listEmpty.textContent = "暂无记录。";
        bodyEl.textContent = "暂无历史记录。";
        clearAnalyzeSkillFooter(footEl);
        return;
      }
      listEmpty.hidden = true;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const id = e && e.id;
        if (typeof id !== "string" || !id) {
          continue;
        }
        const li = document.createElement("li");
        li.className = "analyze-history-list__item";
        li.setAttribute("role", "button");
        li.setAttribute("tabindex", "0");
        li.dataset.id = id;

        const titleRow = document.createElement("div");
        titleRow.className = "analyze-history-list__title-row";
        const titleMain = document.createElement("div");
        titleMain.className = "analyze-history-list__title-text";
        const logName =
          typeof e.log_name === "string" ? e.log_name : "—";
        const presetLabel =
          typeof e.preset_label === "string"
            ? e.preset_label
            : String(e.preset || "");
        const when = formatWhen(
          typeof e.created_at === "string" ? e.created_at : "",
        );
        titleMain.textContent =
          logName +
          " · " +
          (presetLabel || "—") +
          (when ? " · " + when : "");

        const priceEl = document.createElement("span");
        priceEl.className = "analyze-history-list__price";
        priceEl.setAttribute(
          "title",
          "预估费用 (¥，AGICTO 目录价)",
        );
        priceEl.textContent = formatFinalPriceTitle(
          e.totals && typeof e.totals === "object" ? e.totals : {},
        );

        titleRow.appendChild(titleMain);
        titleRow.appendChild(priceEl);

        const tok =
          e.approx_tokens != null ? Number(e.approx_tokens) : null;
        const rs =
          typeof e.range_date_start === "string" ? e.range_date_start : "";
        const re =
          typeof e.range_date_end === "string" ? e.range_date_end : "";
        const paramsEl = buildTotalsParamsEl(
          e.totals && typeof e.totals === "object" ? e.totals : {},
          tok,
          rs,
          re,
        );

        li.appendChild(titleRow);
        li.appendChild(paramsEl);

        li.addEventListener("click", function () {
          activateEntry(id, li);
        });
        li.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            activateEntry(id, li);
          }
        });
        listUl.appendChild(li);
      }

      function applyHash() {
        const raw = (location.hash || "").replace(/^#/, "").trim();
        if (!raw) {
          return;
        }
        const row = findRowById(raw);
        if (row) {
          activateEntry(raw, row);
        }
      }

      applyHash();
      window.addEventListener("hashchange", applyHash);
    })
    .catch(function (err) {
      listEmpty.hidden = false;
      listEmpty.textContent =
        "加载失败：" + ((err && err.message) || String(err));
      bodyEl.textContent = "";
      clearAnalyzeSkillFooter(footEl);
    });
}
