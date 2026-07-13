import { describe, expect, it } from 'vitest';
import { planFifoDeductions } from './inventoryMath';

describe('planFifoDeductions', () => {
  it('deducts from one batch when that batch has enough stock', () => {
    const result = planFifoDeductions([
      { id: 'batch-1', qtyRemaining: 5, unitCost: 10_000 },
    ], 3);

    expect(result).toEqual({
      deductions: [{ batchId: 'batch-1', qty: 3, unitCost: 10_000 }],
      totalCogs: 30_000,
      deductedQty: 3,
      remaining: 0,
    });
  });

  it('spills into the next batch and deducts only part of it', () => {
    const result = planFifoDeductions([
      { id: 'batch-1', qtyRemaining: 2, unitCost: 10_000 },
      { id: 'batch-2', qtyRemaining: 5, unitCost: 12_000 },
    ], 4);

    expect(result.deductions).toEqual([
      { batchId: 'batch-1', qty: 2, unitCost: 10_000 },
      { batchId: 'batch-2', qty: 2, unitCost: 12_000 },
    ]);
    expect(result.deductedQty).toBe(4);
    expect(result.remaining).toBe(0);
    expect(result.totalCogs).toBe(44_000);
  });

  it('matches an exact request across multiple batches in FIFO order', () => {
    const result = planFifoDeductions([
      { id: 'oldest', qtyRemaining: 2, unitCost: 10 },
      { id: 'middle', qtyRemaining: 3, unitCost: 20 },
      { id: 'newest', qtyRemaining: 4, unitCost: 30 },
    ], 9);

    expect(result.deductions.map((deduction) => deduction.batchId)).toEqual(['oldest', 'middle', 'newest']);
    expect(result.deductedQty).toBe(9);
    expect(result.remaining).toBe(0);
    expect(result.totalCogs).toBe(200);
  });

  it('reports the still-missing quantity when stock is insufficient', () => {
    const result = planFifoDeductions([
      { id: 'batch-1', qtyRemaining: 2, unitCost: 100 },
      { id: 'batch-2', qtyRemaining: 3, unitCost: 200 },
    ], 7);

    expect(result.deductedQty).toBe(5);
    expect(result.remaining).toBe(2);
    expect(result.totalCogs).toBe(800);
  });

  it('keeps the request remaining when there are no batches', () => {
    expect(planFifoDeductions([], 2)).toEqual({
      deductions: [],
      totalCogs: 0,
      deductedQty: 0,
      remaining: 2,
    });
  });

  it('calculates total COGS from each deduction, not an averaged cost', () => {
    const result = planFifoDeductions([
      { id: 'batch-1', qtyRemaining: 1, unitCost: 1_000 },
      { id: 'batch-2', qtyRemaining: 2, unitCost: 2_500 },
      { id: 'batch-3', qtyRemaining: 4, unitCost: 4_000 },
    ], 5);
    const summedCogs = result.deductions.reduce(
      (sum, deduction) => sum + deduction.qty * deduction.unitCost,
      0,
    );

    expect(result.totalCogs).toBe(summedCogs);
    expect(result.totalCogs).toBe(14_000);
  });
});
