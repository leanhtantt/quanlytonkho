import { describe, expect, it } from 'vitest';
import { allocatePurchaseItemCosts } from './procurementMath';

describe('allocatePurchaseItemCosts', () => {
  it('allocates discounts, compensation and purchase fees by item cost ratio', () => {
    const result = allocatePurchaseItemCosts([
      { totalCost: 100, totalWeight: 0, qty: 2 },
      { totalCost: 300, totalWeight: 0, qty: 3 },
    ], {
      totalDiscount: 40,
      totalCompensation: 20,
      purchaseFee: 60,
      domesticShippingFee: 0,
      internationalShippingFee: 0,
    });

    expect(result[0]).toMatchObject({ costRatio: 0.25, finalTotalCost: 100, unitCost: 50 });
    expect(result[1]).toMatchObject({ costRatio: 0.75, finalTotalCost: 300, unitCost: 100 });
  });

  it('allocates shipping by weight ratio when the item has weight', () => {
    const result = allocatePurchaseItemCosts([
      { totalCost: 100, totalWeight: 1, qty: 1 },
      { totalCost: 100, totalWeight: 3, qty: 1 },
    ], {
      totalDiscount: 0,
      totalCompensation: 0,
      purchaseFee: 0,
      domesticShippingFee: 400,
      internationalShippingFee: 800,
    });

    expect(result[0]).toMatchObject({ weightRatio: 0.25, allocatedDomesticShipping: 100, allocatedInternationalShipping: 200, finalTotalCost: 400 });
    expect(result[1]).toMatchObject({ weightRatio: 0.75, allocatedDomesticShipping: 300, allocatedInternationalShipping: 600, finalTotalCost: 1_000 });
  });

  it('falls back to cost ratio for shipping when every weight is zero', () => {
    const result = allocatePurchaseItemCosts([
      { totalCost: 100, totalWeight: 0, qty: 1 },
      { totalCost: 300, totalWeight: 0, qty: 1 },
    ], {
      totalDiscount: 0,
      totalCompensation: 0,
      purchaseFee: 0,
      domesticShippingFee: 400,
      internationalShippingFee: 800,
    });

    expect(result[0]).toMatchObject({ weightRatio: 0, allocatedDomesticShipping: 100, allocatedInternationalShipping: 200, finalTotalCost: 400 });
    expect(result[1]).toMatchObject({ weightRatio: 0, allocatedDomesticShipping: 300, allocatedInternationalShipping: 600, finalTotalCost: 1_200 });
  });

  it('subtracts discounts and compensation, adds fees, and rounds unit cost', () => {
    const [result] = allocatePurchaseItemCosts([
      { totalCost: 100, totalWeight: 1, qty: 3 },
    ], {
      totalDiscount: 10,
      totalCompensation: 5,
      purchaseFee: 8,
      domesticShippingFee: 4,
      internationalShippingFee: 6,
    });

    expect(result.finalTotalCost).toBe(103);
    expect(result.unitCost).toBe(34);
  });

  it('gives one item 100 percent of every allocation', () => {
    const [result] = allocatePurchaseItemCosts([
      { totalCost: 200, totalWeight: 2, qty: 2 },
    ], {
      totalDiscount: 20,
      totalCompensation: 10,
      purchaseFee: 30,
      domesticShippingFee: 40,
      internationalShippingFee: 50,
    });

    expect(result).toMatchObject({
      costRatio: 1,
      weightRatio: 1,
      allocatedDiscount: 20,
      allocatedCompensation: 10,
      allocatedPurchaseFee: 30,
      allocatedDomesticShipping: 40,
      allocatedInternationalShipping: 50,
      finalTotalCost: 290,
      unitCost: 145,
    });
  });
});
