(function () {
  const selectEl = document.getElementById("log-select");
  const contentEl = document.getElementById("log-content");
  const rootEl = document.getElementById("log-root");
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

  async function loadFileList() {
    showError("");
    selectEl.innerHTML = '<option value="">— Loading… —</option>';
    try {
      const data = await fetchJson("/api/logs");
      rootEl.textContent = "Directory: " + data.root;
      rootEl.hidden = false;
      selectEl.innerHTML = "";
      if (!data.files || data.files.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "— No log files —";
        selectEl.appendChild(opt);
        contentEl.textContent = "No files in log directory.";
        return;
      }
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "— Choose a file —";
      selectEl.appendChild(placeholder);
      for (const name of data.files) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        selectEl.appendChild(opt);
      }
    } catch (e) {
      selectEl.innerHTML = '<option value="">— Error —</option>';
      showError("Failed to load log list: " + e.message);
      contentEl.textContent = "";
    }
  }

  async function loadLog(name) {
    if (!name) {
      contentEl.textContent = "Select a log file.";
      metaEl.hidden = true;
      return;
    }
    showError("");
    contentEl.textContent = "Loading…";
    metaEl.hidden = true;
    try {
      const data = await fetchJson(
        "/api/logs/" + encodeURIComponent(name)
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

  function formatBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  selectEl.addEventListener("change", function () {
    loadLog(selectEl.value);
  });

  loadFileList();
})();
