/**
 * ⬇️ Pick an emoji for a single log line (severity / kind heuristics).
 */
export function statKindForLine(line) {
  const s = String(line);
  const t = s.trim();
  if (!t) return "other";
  if (/^\[[…]/.test(t) || /^\[\.\.\./.test(t)) return "other";
  if (/traceback|exception|\bfatal\b|\bcritical\b|\berror\b|errno\s+/i.test(s))
    return "error";
  if (/\bwarn(?:ing)?\b|\] warn\b/i.test(s)) return "warning";
  if (/\bdebug\b/i.test(s)) return "debug";
  if (/\binfo\b|\] info\b/i.test(s)) return "info";
  if (/\s5\d{2}(\s|$|,)/.test(s) || /" 5\d{2} /.test(s)) return "error";
  if (/\s4\d{2}(\s|$|,)/.test(s) || /" 4\d{2} /.test(s)) return "warning";
  if (
    /\b(?:listening|started|running|ready)\b/i.test(s) &&
    !/\berror\b/i.test(s)
  )
    return "lifecycle";
  if (/\b(?:shutdown|stopped|terminated|killed)\b/i.test(s))
    return "lifecycle";
  if (/\s2\d{2}(\s|$|,)/.test(s) || /\b200 ok\b/i.test(s)) return "success";
  if (/\b(?:success|succeeded|completed)\b/i.test(s)) return "success";
  if (/\b(?:deprecated)\b/i.test(s)) return "reminder";
  if (/\?{3,}|TODO|FIXME/i.test(s)) return "reminder";
  return "other";
}

const WEEKDAY_ZH = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
];

export function formatDayTitleZh(d) {
  return (
    (d.getMonth() + 1) +
    "月" +
    d.getDate() +
    "日 " +
    WEEKDAY_ZH[d.getDay()]
  );
}

const STAT_LABEL_ZH = {
  error: "错误",
  warning: "警告",
  info: "信息",
  debug: "调试",
  success: "成功",
  lifecycle: "运行",
  reminder: "提醒",
  other: "其他",
};

const STAT_ORDER = [
  "error",
  "warning",
  "info",
  "debug",
  "success",
  "lifecycle",
  "reminder",
  "other",
];

export function formatDayStatsZh(stats) {
  const parts = [];
  for (let i = 0; i < STAT_ORDER.length; i++) {
    const k = STAT_ORDER[i];
    const n = stats[k] || 0;
    if (n > 0) {
      let label = STAT_LABEL_ZH[k];
      if (k === "error") {
        label = "🚨 " + label;
      } else if (k === "warning") {
        label = "⚠️ " + label;
      }
      parts.push(label + " " + n);
    }
  }
  return parts.length ? parts.join(" · ") : "无分类统计";
}

export function emptyStats() {
  return {
    error: 0,
    warning: 0,
    info: 0,
    debug: 0,
    success: 0,
    lifecycle: 0,
    reminder: 0,
    other: 0,
  };
}

export function emojiForLogLine(line) {
  const s = String(line);
  const t = s.trim();
  if (!t) return "⬜";
  if (/^\[[…]/.test(t) || /^\[\.\.\./.test(t)) return "📎";
  if (/traceback|exception|\bfatal\b|\bcritical\b|\berror\b|errno\s+/i.test(s))
    return "🚨";
  if (/\bwarn(?:ing)?\b|\] warn\b/i.test(s)) return "⚠️";
  if (/\bdebug\b/i.test(s)) return "🐛";
  if (/\binfo\b|\] info\b/i.test(s)) return "ℹ️";
  if (
    /\b(?:listening|started|running|ready)\b/i.test(s) &&
    !/\berror\b/i.test(s)
  )
    return "🚀";
  if (/\b(?:shutdown|stopped|terminated|killed)\b/i.test(s)) return "🛑";
  if (/\s5\d{2}(\s|$|,)/.test(s) || /" 5\d{2} /.test(s)) return "🔥";
  if (/\s4\d{2}(\s|$|,)/.test(s) || /" 4\d{2} /.test(s)) return "🚧";
  if (/\s2\d{2}(\s|$|,)/.test(s) || /\b200 ok\b/i.test(s)) return "✅";
  if (/\b(?:success|succeeded|completed)\b/i.test(s)) return "✔️";
  if (/\b(?:deprecated)\b/i.test(s)) return "📜";
  if (/\?{3,}|TODO|FIXME/i.test(s)) return "❓";
  return "📌";
}
