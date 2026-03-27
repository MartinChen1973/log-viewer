(function () {
  const params = new URLSearchParams(window.location.search);
  const name = params.get("name");
  const contentEl = document.getElementById("log-content");
  const titleEl = document.getElementById("view-title");
  const metaEl = document.getElementById("file-meta");
  const errorEl = document.getElementById("error-banner");

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || res.statusText || String(res.status));
    }
    return data;
  }

  function formatBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  async function loadLog(fileName) {
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
        "/api/logs/" + encodeURIComponent(fileName)
      );
      const parts = [];
      parts.push(formatBytes(data.size));
      if (data.truncated) parts.push("truncated");
      metaEl.textContent = parts.join(" · ");
      metaEl.hidden = false;
      contentEl.textContent = data.content;
    } catch (e) {
      contentEl.textContent = "";
      showError("Failed to load log: " + e.message);
    }
  }

  loadLog(name);
})();
