export interface PurchaseCostItem {
  qty: number;
  totalCost: number;
  totalWeight: number;
}

export interface PurchaseAllocationTotals {
  totalDiscount: number;
  totalCompensation: number;
  purchaseFee: number;
  domesticShippingFee: number;
  internationalShippingFee: number;
}

export function allocatePurchaseItemCosts(
  items: PurchaseCostItem[],
  totals: PurchaseAllocationTotals,
) {
  const totalOrderCost = items.reduce((sum, item) => sum + item.totalCost, 0);
  const totalOrderWeight = items.reduce((sum, item) => sum + item.totalWeight, 0);

  return items.map((item) => {
    const costRatio = totalOrderCost > 0 ? item.totalCost / totalOrderCost : 0;
    const weightRatio = totalOrderWeight > 0 ? item.totalWeight / totalOrderWeight : 0;
    const shippingRatio = weightRatio > 0 ? weightRatio : costRatio;

    const allocatedDiscount = totals.totalDiscount * costRatio;
    const allocatedCompensation = totals.totalCompensation * costRatio;
    const allocatedPurchaseFee = totals.purchaseFee * costRatio;
    const allocatedDomesticShipping = totals.domesticShippingFee * shippingRatio;
    const allocatedInternationalShipping = totals.internationalShippingFee * shippingRatio;
    const finalTotalCost = item.totalCost
      - allocatedDiscount
      - allocatedCompensation
      + allocatedPurchaseFee
      + allocatedDomesticShipping
      + allocatedInternationalShipping;

    return {
      costRatio,
      weightRatio,
      allocatedDiscount,
      allocatedCompensation,
      allocatedPurchaseFee,
      allocatedDomesticShipping,
      allocatedInternationalShipping,
      finalTotalCost,
      unitCost: Math.round(finalTotalCost / item.qty),
    };
  });
}
