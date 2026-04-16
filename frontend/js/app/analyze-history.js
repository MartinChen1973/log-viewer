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
 * @param {Record<string, unknown>} totals
 * @returns {string}
 */
function formatTotalsSummaryLine(totals) {
  if (!totals || typeof totals !== "object") {
    return "";
  }
  const has = Boolean(totals.has_agent_steps);
  const counted = Number(totals.counted_agent) || 0;
  if (!has || counted < 1) {
    return "合计：—（无智能体用量明细）";
  }
  const sumIn = Number(totals.sum_in) || 0;
  const sumOut = Number(totals.sum_out) || 0;
  const sumTot = Number(totals.sum_tot) || 0;
  const sumCost = Number(totals.sum_cost_usd);
  const sumEst = Number(totals.sum_est_cny);
  const pin = totals.catalog_in_cny_per_m;
  const pout = totals.catalog_out_cny_per_m;
  const fmtUsd = (n) =>
    typeof n === "number" && Number.isFinite(n) ? "$" + n.toFixed(6) : "-";
  const fmtCny = (n) =>
    typeof n === "number" && Number.isFinite(n) ? "¥" + n.toFixed(6) : "-";
  const fmtM = (n) =>
    typeof n === "number" && Number.isFinite(n) ? String(n) : "-";
  const colIn = sumIn > 0 ? String(sumIn) : "-";
  const colOut = sumOut > 0 ? String(sumOut) : "-";
  const colTot = sumTot > 0 ? String(sumTot) : "-";
  const colCost =
    counted > 0 && sumCost > 0 ? fmtUsd(sumCost) : "-";
  const colPin = pin != null ? fmtM(pin) : "-";
  const colPout = pout != null ? fmtM(pout) : "-";
  const colEst =
    counted > 0 && sumEst > 0 ? fmtCny(sumEst) : "-";
  return (
    "合计（智能体行）：输入 " +
    colIn +
    " · 输出 " +
    colOut +
    " · 总计 " +
    colTot +
    " · 费用 " +
    colCost +
    " · 入¥/M " +
    colPin +
    " · 出¥/M " +
    colPout +
    " · 预估 " +
    colEst
  );
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
    const when = formatWhen(
      typeof data.created_at === "string" ? data.created_at : "",
    );
    metaEl.textContent =
      logName +
      " · " +
      (presetLabel || "—") +
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

        const line1 = document.createElement("div");
        line1.className = "analyze-history-list__line1";
        const logName =
          typeof e.log_name === "string" ? e.log_name : "—";
        const presetLabel =
          typeof e.preset_label === "string"
            ? e.preset_label
            : String(e.preset || "");
        const when = formatWhen(
          typeof e.created_at === "string" ? e.created_at : "",
        );
        line1.textContent =
          logName +
          " · " +
          (presetLabel || "—") +
          (when ? " · " + when : "");

        const line2 = document.createElement("div");
        line2.className = "analyze-history-list__line2";
        const tok =
          e.approx_tokens != null ? Number(e.approx_tokens) : null;
        const tokBit =
          tok != null && Number.isFinite(tok)
            ? "片段约 " + String(tok) + " tok"
            : "";
        const totLine = formatTotalsSummaryLine(
          e.totals && typeof e.totals === "object" ? e.totals : {},
        );
        line2.textContent = (tokBit ? tokBit + " · " : "") + totLine;

        li.appendChild(line1);
        li.appendChild(line2);

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
