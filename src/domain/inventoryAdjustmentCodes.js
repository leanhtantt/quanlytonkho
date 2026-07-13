export function buildInventoryAdjustmentDisplayCodes(adjustments) {
  return new Map(
    [...adjustments]
      .sort((a, b) => (
        String(a.date || '').localeCompare(String(b.date || ''))
        || String(a.id || '').localeCompare(String(b.id || ''))
      ))
      .map((adjustment, index) => [
        adjustment.id,
        `KKD${String(index + 1).padStart(4, '0')}`
      ])
  );
}
