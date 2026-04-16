export function clearPickedMicroCellsExceptRow(listEl, keepRow) {
  if (!listEl) return;
  listEl.querySelectorAll(".log-list__hourly-cell--picked").forEach(
    function (el) {
      const r = el.closest(".log-list__item");
      if (!keepRow) {
        el.classList.remove("log-list__hourly-cell--picked");
      } else if (r && r !== keepRow) {
        el.classList.remove("log-list__hourly-cell--picked");
      }
    },
  );
}

export function clearPickedMicroCellsInRow(row) {
  if (!row) return;
  row.querySelectorAll(".log-list__hourly-cell--picked").forEach(function (el) {
    el.classList.remove("log-list__hourly-cell--picked");
  });
}

export function markPickedDayDrill(listEl, dayCell) {
  if (!dayCell) return;
  const row = dayCell.closest(".log-list__item");
  if (!row) return;
  clearPickedMicroCellsExceptRow(listEl, row);
  clearPickedMicroCellsInRow(row);
  dayCell.classList.add("log-list__hourly-cell--picked");
}

export function markPickedHourDrill(listEl, hourCell, todayYmd) {
  if (!hourCell) return;
  const row = hourCell.closest(".log-list__item");
  if (!row) return;
  clearPickedMicroCellsExceptRow(listEl, row);
  clearPickedMicroCellsInRow(row);
  hourCell.classList.add("log-list__hourly-cell--picked");
  const y = String(todayYmd).replace(/"/g, "");
  const todayDay = row.querySelector(
    '.log-list__hourly--recent .log-list__hourly-blocks [data-drill-ymd="' +
      y +
      '"]',
  );
  if (todayDay) {
    todayDay.classList.add("log-list__hourly-cell--picked");
  }
}
