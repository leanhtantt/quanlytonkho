export const HISTORY_MONTH_STEP = 3;

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function initialHistoryRange(now = new Date()) {
  return {
    from: isoDate(new Date(now.getFullYear(), now.getMonth() - (HISTORY_MONTH_STEP - 1), 1)),
    to: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

export function extendHistoryRange(range, months = HISTORY_MONTH_STEP) {
  const [year, month] = range.from.split('-').map(Number);
  return {
    ...range,
    from: isoDate(new Date(year, month - 1 - months, 1)),
  };
}

export function formatHistoryRange(range) {
  const format = value => new Intl.DateTimeFormat('vi-VN').format(new Date(`${value}T00:00:00`));
  return `${format(range.from)} – ${format(range.to)}`;
}
