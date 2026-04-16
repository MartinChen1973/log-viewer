/** ⬇️ Ordered (first match wins); substrings checked on lowercased log name. */
const APP_EMOJI_LOG_NAME_RULES = [
  [["docker"], "🐳"],
  [["mysql", "mariadb"], "🐬"],
  [["postgres"], "🐘"],
  [["mongo"], "🍃"],
  [["redis"], "⚡"],
  [["nginx"], "🌐"],
  [["apache", "httpd"], "🪶"],
  [["node", "npm"], "🟢"],
  [["python", "uvicorn", "gunicorn"], "🐍"],
  [["java", "tomcat", "spring"], "☕"],
  [["elastic"], "🔍"],
  [["kafka"], "📨"],
  [["rabbit"], "🐰"],
  [["git"], "📂"],
];

/**
 * ⬇️ Infer a representative app / stack emoji from the log file name (heuristic).
 */
export function appEmojiForLogName(name) {
  const n = String(name).toLowerCase();
  for (let i = 0; i < APP_EMOJI_LOG_NAME_RULES.length; i++) {
    const row = APP_EMOJI_LOG_NAME_RULES[i];
    if (
      row[0].some(function (k) {
        return n.includes(k);
      })
    ) {
      return row[1];
    }
  }
  return "📄";
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

export function buildIssueSummary(errorCount, warningCount) {
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

export function rowAriaLabel(name, err, warn) {
  const app = appEmojiForLogName(name);
  let tail = "";
  if (err || warn) {
    tail = ". " + summarizeCountsAria(err, warn);
  } else {
    tail = ". No error or warning patterns in sample";
  }
  return "Show timeline for " + name + ". Source hint " + app + tail;
}
