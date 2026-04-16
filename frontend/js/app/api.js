/**
 * Fetch JSON from the same origin; throws with server error message when possible.
 */
export async function fetchJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || res.statusText || String(res.status));
  }
  return data;
}

const JSON_UTF8 = "application/json;charset=utf-8";
const HTTP_METHOD_POST = "POST";
/** Aligns with Flask `urllib` timeout to the AI API (see `backend/app.py`). */
const ANALYZE_FETCH_MS = 600_000;

/**
 * POST JSON; returns `{ ok, data, message? }` for analyze endpoints that return `ai_error` on failure.
 * Never throws: network failures and `AbortSignal` timeouts are returned as `{ ok: false, message }`.
 */
export async function postJsonAnalyzed(url, body, options) {
  const opts = options || {};
  let signal = opts.signal;
  if (
    !signal &&
    typeof AbortSignal !== "undefined" &&
    typeof AbortSignal.timeout === "function"
  ) {
    signal = AbortSignal.timeout(opts.timeoutMs ?? ANALYZE_FETCH_MS);
  }
  let res;
  try {
    res = await fetch(url, {
      method: HTTP_METHOD_POST,
      headers: { "Content-Type": JSON_UTF8 },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    const name = e && e.name;
    if (name === "AbortError" || name === "TimeoutError") {
      return {
        ok: false,
        data: {},
        message:
          "请求超时。请确认 AI API（127.0.0.1:8500）已启动且模型可用，或稍后重试。",
      };
    }
    return {
      ok: false,
      data: {},
      message: (e && e.message) || String(e),
    };
  }
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    return { ok: true, data };
  }
  const msg =
    (typeof data.error === "string" && data.error) ||
    (typeof data.ai_error === "string" && data.ai_error) ||
    res.statusText ||
    String(res.status);
  return { ok: false, data, message: msg };
}
