import { prisma } from '../src/prismaClient';
import * as xlsx from 'xlsx';
import { createPurchaseOrder } from '../src/services/procurementService';

// Excel date to JS date helper
function excelDateToJSDate(excelDate: number) {
  return new Date(Math.round((excelDate - 25569) * 86400 * 1000));
}

async function main() {
  const path = 'D:\\Luyen\\QUẢN LÝ HÀNG HÓA.xlsx';
  console.log(`Reading Excel file from ${path}...`);
  
  const workbook = xlsx.readFile(path);
  const sheetName = 'NHAP HANG';
  const sheet = workbook.Sheets[sheetName];
  
  if (!sheet) {
    throw new Error(`Sheet ${sheetName} not found`);
  }

  const data: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  let currentOrder: any = null;
  const orders: any[] = [];
  const skippedRows: any[] = [];

  // Group rows into orders
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    
    const rawOrderCode = row[0]; 
    const rawDate = row[1];      
    
    const sku = row[2];          
    const name = row[3];
    if (!sku || !name) continue; 
    
    const qty = Number(row[10]);
    if (isNaN(qty) || qty <= 0) {
      skippedRows.push(`Skipped row ${i+1} (${name}) - No quantity.`);
      continue;
    }
    
    const baseCost = Number(row[5]) || 0; // Giá gốc
    const totalWeight = Number(row[4]) || 0; // Trọng lượng
    
    let orderCode = '';
    let orderDate = new Date(); 
    
    if (rawOrderCode && typeof rawOrderCode === 'string' && rawOrderCode.includes('ĐƠN')) {
       orderCode = String(rawOrderCode).trim();
    } else if (currentOrder) {
       orderCode = currentOrder.code;
    }

    if (!orderCode) {
      // Not part of a "ĐƠN 0x", so skip it (e.g. Tồn kho đầu kỳ, vật tư tiêu hao)
      skippedRows.push(`Skipped row ${i+1} (${name}) - Missing Order Code (ĐƠN).`);
      continue;
    }

    if (rawDate && typeof rawDate === 'number') {
       orderDate = excelDateToJSDate(rawDate);
    } else if (currentOrder && currentOrder.code === orderCode) {
       orderDate = currentOrder.receivedAt;
    }

    if (!currentOrder || currentOrder.code !== orderCode) {
       // This is the first row of a new order
       const purchaseFee = Number(row[6]) || 0;
       const domesticShippingFee = Number(row[7]) || 0;
       const internationalShippingFee = Number(row[8]) || 0;

       currentOrder = {
         code: orderCode,
         receivedAt: orderDate,
         items: [],
         notes: '',
         totalDiscount: 0,
         totalCompensation: 0,
         purchaseFee,
         domesticShippingFee,
         internationalShippingFee,
       };
       orders.push(currentOrder);
    }
    
    currentOrder.items.push({
      sku,
      name,
      qty,
      totalCost: baseCost,
      totalWeight
    });
  }

  console.log(`\n--- IMPORT SUMMARY ---`);
  console.log(`Found ${orders.length} valid orders to import.`);
  if (skippedRows.length > 0) {
    console.log(`\nSkipped ${skippedRows.length} rows as requested (Tồn kho đầu kỳ, vật tư, thiếu SL, v.v.):`);
    for (const msg of skippedRows) {
      console.log(' - ' + msg);
    }
    console.log('Vui lòng tạo/sửa thủ công các mục bị bỏ qua nếu cần.\n');
  }

  // Process orders
  for (const order of orders) {
    console.log(`Processing Order: ${order.code} with ${order.items.length} items...`);
    
    // Convert SKUs to Product IDs
    const itemsWithIds = [];
    for (const item of order.items) {
      const product = await prisma.product.upsert({
        where: { sku: String(item.sku).trim() },
        update: { name: String(item.name).trim() },
        create: { 
          sku: String(item.sku).trim(), 
          name: String(item.name).trim() 
        }
      });
      itemsWithIds.push({
        productId: product.id,
        qty: item.qty,
        totalCost: item.totalCost,
        totalWeight: item.totalWeight
      });
    }
    
    // Map properties for createPurchaseOrder
    const purchaseInput = {
      code: order.code,
      receivedAt: order.receivedAt,
      notes: order.notes,
      items: itemsWithIds,
      totalDiscount: order.totalDiscount,
      totalCompensation: order.totalCompensation,
      purchaseFee: order.purchaseFee,
      domesticShippingFee: order.domesticShippingFee,
      internationalShippingFee: order.internationalShippingFee,
    };

    // Check if PO already exists
    const existingPO = await prisma.purchaseOrder.findUnique({
      where: { code: order.code }
    });

    if (existingPO) {
      console.log(`Order ${order.code} already exists. Skipping.`);
      continue;
    }

    try {
      await createPurchaseOrder(purchaseInput);
      console.log(`Successfully created order ${order.code}.`);
    } catch (error: any) {
      console.error(`Failed to create order ${order.code}:`, error.message);
    }
  }

  console.log("Import completed!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
