'use strict';

(function () {
  // State
  const AUTOSCROLL_THRESHOLD = 50; // px from bottom to trigger auto-scroll
  let currentFile = null;
  let tailEventSource = null;
  let isTailing = false;
  let autoScroll = true;

  // DOM refs
  const sourcesList = document.getElementById('sources-list');
  const welcomeEl = document.getElementById('welcome');
  const viewerEl = document.getElementById('viewer');
  const currentFileEl = document.getElementById('current-file');
  const logContentEl = document.getElementById('log-content');
  const fileSizeEl = document.getElementById('file-size');
  const fileMtimeEl = document.getElementById('file-mtime');
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');
  const clearSearchBtn = document.getElementById('clear-search-btn');
  const searchResultsEl = document.getElementById('search-results');
  const searchCountEl = document.getElementById('search-count');
  const searchContentEl = document.getElementById('search-content');
  const logContainerEl = document.getElementById('log-container');
  const tailToggle = document.getElementById('tail-toggle');
  const tailIndicator = document.getElementById('tail-indicator');
  const linesSelect = document.getElementById('lines-select');
  const refreshBtn = document.getElementById('refresh-sources');
  const scrollBottomBtn = document.getElementById('scroll-bottom-btn');
  const reloadBtn = document.getElementById('reload-btn');
  const backToLogBtn = document.getElementById('back-to-log-btn');
  const serverInfoEl = document.getElementById('server-info');

  // Utility: format file size
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // Utility: format date
  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleString();
  }

  // Colorize log lines
  function colorizeLine(line) {
    const lower = line.toLowerCase();
    let cls = '';
    if (/\b(error|err|fatal|critical|crit|exception|traceback)\b/.test(lower)) cls = 'line-error';
    else if (/\b(warn|warning)\b/.test(lower)) cls = 'line-warn';
    else if (/\b(info|information|notice)\b/.test(lower)) cls = 'line-info';
    else if (/\b(debug|trace|verbose)\b/.test(lower)) cls = 'line-debug';
    return cls;
  }

  // Render log content with colorized lines
  function renderLogContent(text, el) {
    const lines = text.split('\n');
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < lines.length; i++) {
      const span = document.createElement('span');
      const cls = colorizeLine(lines[i]);
      if (cls) span.className = cls;
      span.textContent = lines[i] + (i < lines.length - 1 ? '\n' : '');
      fragment.appendChild(span);
    }
    el.innerHTML = '';
    el.appendChild(fragment);
  }

  // Load sources from API
  async function loadSources() {
    sourcesList.innerHTML = '<div class="loading">Loading...</div>';
    try {
      const resp = await fetch('/api/sources');
      const sources = await resp.json();
      renderSources(sources);
    } catch (e) {
      sourcesList.innerHTML = '<div class="loading" style="color:var(--error)">Failed to load sources</div>';
    }
  }

  function renderSources(sources) {
    sourcesList.innerHTML = '';
    if (!sources.length) {
      sourcesList.innerHTML = '<div class="loading">No log sources configured</div>';
      return;
    }
    sources.forEach((source, idx) => {
      const group = document.createElement('div');
      group.className = 'source-group';

      const nameEl = document.createElement('div');
      nameEl.className = 'source-name open';
      nameEl.textContent = source.name;
      nameEl.setAttribute('title', source.path);
      group.appendChild(nameEl);

      const fileList = document.createElement('div');
      fileList.className = 'file-list open';

      if (!source.files.length) {
        const noFiles = document.createElement('div');
        noFiles.className = 'no-files';
        noFiles.textContent = 'No log files found';
        fileList.appendChild(noFiles);
      } else {
        source.files.forEach(file => {
          const item = document.createElement('div');
          item.className = 'file-item';
          if (currentFile && currentFile === file.path) item.classList.add('active');
          item.dataset.path = file.path;

          const icon = document.createElement('span');
          icon.className = 'file-icon';
          icon.textContent = '📄';
          item.appendChild(icon);

          const nameSpan = document.createElement('span');
          nameSpan.className = 'file-name';
          nameSpan.textContent = file.name;
          nameSpan.title = file.path;
          item.appendChild(nameSpan);

          const sizeSpan = document.createElement('span');
          sizeSpan.className = 'file-size';
          sizeSpan.textContent = formatSize(file.size);
          item.appendChild(sizeSpan);

          item.addEventListener('click', () => openFile(file.path));
          fileList.appendChild(item);
        });
      }

      nameEl.addEventListener('click', () => {
        nameEl.classList.toggle('open');
        fileList.classList.toggle('open');
      });

      group.appendChild(fileList);
      sourcesList.appendChild(group);
    });
  }

  // Open a log file
  async function openFile(filePath) {
    stopTailing();
    currentFile = filePath;

    // Update active state in sidebar
    document.querySelectorAll('.file-item').forEach(el => {
      el.classList.toggle('active', el.dataset.path === filePath);
    });

    // Show viewer
    welcomeEl.classList.add('hidden');
    viewerEl.classList.remove('hidden');
    currentFileEl.textContent = filePath;
    currentFileEl.title = filePath;
    logContentEl.textContent = 'Loading...';
    fileSizeEl.textContent = 'Size: —';
    fileMtimeEl.textContent = 'Modified: —';

    hideSearch();

    await loadFile(filePath);

    if (tailToggle.checked) {
      startTailing(filePath);
    }
  }

  async function loadFile(filePath) {
    const lines = linesSelect.value;
    try {
      const resp = await fetch(`/api/files?path=${encodeURIComponent(filePath)}&lines=${lines}`);
      const data = await resp.json();
      if (data.error) {
        logContentEl.textContent = 'Error: ' + data.error;
        return;
      }
      renderLogContent(data.content, logContentEl);
      fileSizeEl.textContent = 'Size: ' + formatSize(data.size);
      fileMtimeEl.textContent = 'Modified: ' + formatDate(data.mtime);
      scrollToBottom(logContentEl);
    } catch (e) {
      logContentEl.textContent = 'Failed to load file.';
    }
  }

  function scrollToBottom(el) {
    el.scrollTop = el.scrollHeight;
  }

  // Tailing
  function startTailing(filePath) {
    if (tailEventSource) tailEventSource.close();
    isTailing = true;
    tailIndicator.classList.remove('hidden');

    tailEventSource = new EventSource(`/api/tail?path=${encodeURIComponent(filePath)}`);
    tailEventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.content) {
        appendLogContent(data.content, logContentEl);
        fileSizeEl.textContent = 'Size: ' + formatSize(data.size);
        if (autoScroll) scrollToBottom(logContentEl);
      }
    };
    tailEventSource.onerror = () => {
      tailIndicator.textContent = '● Disconnected';
      tailIndicator.style.color = 'var(--error)';
      tailIndicator.style.borderColor = 'var(--error)';
    };
  }

  function appendLogContent(text, el) {
    const lines = text.split('\n');
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < lines.length; i++) {
      if (i === lines.length - 1 && lines[i] === '') continue;
      const span = document.createElement('span');
      const cls = colorizeLine(lines[i]);
      if (cls) span.className = cls;
      span.textContent = lines[i] + '\n';
      fragment.appendChild(span);
    }
    el.appendChild(fragment);
  }

  function stopTailing() {
    if (tailEventSource) {
      tailEventSource.close();
      tailEventSource = null;
    }
    isTailing = false;
    tailIndicator.classList.add('hidden');
    tailIndicator.textContent = '● Live';
    tailIndicator.style.color = '';
    tailIndicator.style.borderColor = '';
  }

  // Search
  async function doSearch() {
    const query = searchInput.value.trim();
    if (!query || !currentFile) return;

    try {
      const resp = await fetch(`/api/search?path=${encodeURIComponent(currentFile)}&q=${encodeURIComponent(query)}`);
      const data = await resp.json();
      if (data.error) {
        searchCountEl.textContent = 'Error: ' + data.error;
        return;
      }

      logContainerEl.classList.add('hidden');
      searchResultsEl.classList.remove('hidden');
      clearSearchBtn.classList.remove('hidden');
      searchCountEl.textContent = `${data.totalMatches} match${data.totalMatches !== 1 ? 'es' : ''} for "${query}"`;

      if (data.matches.length === 0) {
        searchContentEl.textContent = 'No matches found.';
        return;
      }

      const lines = data.matches.map(m => `[L${m.lineNumber}] ${m.content}`).join('\n');
      renderLogContent(lines, searchContentEl);
    } catch (e) {
      searchCountEl.textContent = 'Search failed.';
    }
  }

  function hideSearch() {
    searchResultsEl.classList.add('hidden');
    logContainerEl.classList.remove('hidden');
    clearSearchBtn.classList.add('hidden');
    searchInput.value = '';
  }

  // Server info
  async function loadServerInfo() {
    try {
      const resp = await fetch('/api/info');
      const data = await resp.json();
      const mem = Math.round((1 - data.freemem / data.totalmem) * 100);
      serverInfoEl.textContent = `${data.hostname} | ${data.platform} | Mem: ${mem}% | Up: ${Math.floor(data.uptime / 3600)}h`;
    } catch (e) {
      serverInfoEl.textContent = '';
    }
  }

  // Event listeners
  refreshBtn.addEventListener('click', loadSources);

  tailToggle.addEventListener('change', () => {
    if (!currentFile) return;
    if (tailToggle.checked) {
      startTailing(currentFile);
    } else {
      stopTailing();
    }
  });

  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  clearSearchBtn.addEventListener('click', hideSearch);
  backToLogBtn.addEventListener('click', hideSearch);

  scrollBottomBtn.addEventListener('click', () => scrollToBottom(logContentEl));

  reloadBtn.addEventListener('click', () => {
    if (currentFile) loadFile(currentFile);
  });

  linesSelect.addEventListener('change', () => {
    if (currentFile) loadFile(currentFile);
  });

  // Track scroll position for auto-scroll
  logContentEl.addEventListener('scroll', () => {
    const atBottom = logContentEl.scrollHeight - logContentEl.scrollTop - logContentEl.clientHeight < AUTOSCROLL_THRESHOLD;
    autoScroll = atBottom;
  });

  // Init
  loadSources();
  loadServerInfo();
  setInterval(loadServerInfo, 30000);
})();
