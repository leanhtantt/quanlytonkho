export interface FifoBatch {
  id: string;
  qtyRemaining: number;
  unitCost: number;
}

export interface FifoDeduction {
  batchId: string;
  qty: number;
  unitCost: number;
}

export function planFifoDeductions(batches: FifoBatch[], requestedQty: number) {
  let remaining = requestedQty;
  let totalCogs = 0;
  const deductions: FifoDeduction[] = [];

  for (const batch of batches) {
    if (remaining <= 0) break;

    const qty = Math.min(batch.qtyRemaining, remaining);
    totalCogs += qty * batch.unitCost;
    remaining -= qty;
    deductions.push({ batchId: batch.id, qty, unitCost: batch.unitCost });
  }

  return {
    deductions,
    totalCogs,
    deductedQty: requestedQty - remaining,
    remaining,
  };
}
