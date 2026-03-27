(function () {
  var STORAGE_KEY = "log-viewer-theme";
  var THEMES = { light: true, dark: true, blue: true };
  var DEFAULT_THEME = "light";

  function readStored() {
    try {
      var t = localStorage.getItem(STORAGE_KEY);
      if (t && THEMES[t]) return t;
    } catch (e) {}
    return null;
  }

  function setColorSchemeMeta(theme) {
    document.documentElement.style.colorScheme =
      theme === "dark" ? "dark" : "light";
  }

  function applyTheme(theme) {
    if (!THEMES[theme]) theme = DEFAULT_THEME;
    document.documentElement.setAttribute("data-theme", theme);
    setColorSchemeMeta(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {}
    syncButtons(theme);
  }

  function syncButtons(theme) {
    document.querySelectorAll("[data-theme-choice]").forEach(function (btn) {
      var v = btn.getAttribute("data-theme-choice");
      var on = v === theme;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("theme-switcher__btn--active", on);
    });
  }

  function init() {
    var stored = readStored();
    applyTheme(stored || DEFAULT_THEME);
    document.querySelectorAll("[data-theme-choice]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyTheme(btn.getAttribute("data-theme-choice") || DEFAULT_THEME);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.LogViewerTheme = { apply: applyTheme, readStored: readStored };
})();
