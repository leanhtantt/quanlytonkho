import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/appStoreContext';
import { IconSearch as Search, IconPlus as Plus, IconDeviceFloppy as Save, IconX as X, IconUpload as Upload } from '@tabler/icons-react';
import * as XLSX from 'xlsx';
import ProductImage from '../components/ProductImage';
import { calculateOrderGrossProfit } from '../domain/profitAnalytics';
import { findProductByCode } from '../domain/productSku';
import { toast } from '../components/ui/toastHelper';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useAuth } from '../lib/AuthContext';
import PageHeader from '../components/ui/PageHeader';

const normalizeExcelText = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .trim()
  .toLowerCase();

const parseExcelNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value ?? '').replace(/[^0-9.-]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseExcelDate = (value) => {
  if (value === null || value === undefined || value === '') return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().split('T')[0];
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value).trim())) {
    const date = new Date(Math.round((Number(value) - 25569) * 86400 * 1000));
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString().split('T')[0];
  }

  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const vn = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!vn) return undefined;
  const year = vn[3].length === 2 ? `20${vn[3]}` : vn[3];
  return `${year}-${vn[2].padStart(2, '0')}-${vn[1].padStart(2, '0')}`;
};

const isFullyReturned = (items = []) => items.length > 0 && items.every(item => item.isReturned);

const findHeaderIndex = (headers, aliases) => headers.findIndex((header) => {
  const normalized = normalizeExcelText(header);
  return aliases.some(alias => normalized === alias || normalized.includes(alias));
});

export default function Orders() {
  const { products, orders, shops, addOrder, updateOrder, deleteOrder, defaultPackagingCost, defaultReturnFee } = useAppStore();
  const { can } = useAuth();
  const availableShops = React.useMemo(() => Array.from(new Set([
    ...shops,
    ...orders.map(order => order.shop).filter(Boolean)
  ])), [shops, orders]);
  const defaultShop = availableShops[0] || '';
  const [activeShop, setActiveShop] = useState(defaultShop);
  const [showForm, setShowForm] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [pendingOrderDelete, setPendingOrderDelete] = useState(null);
  const [isDeletingOrder, setIsDeletingOrder] = useState(false);
  const [showClearImportIssuesDialog, setShowClearImportIssuesDialog] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reconFilter, setReconFilter] = useState('all'); // all | reconciled | unreconciled
  const [profitFilter, setProfitFilter] = useState('all'); // all | negative
  const [deliveryFilter, setDeliveryFilter] = useState('all'); // all | returned | delivered
  const [dateSort, setDateSort] = useState('newest'); // newest | oldest
  
  // Form State
  const [orderId, setOrderId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [shop, setShop] = useState(defaultShop);
  const [status, setStatus] = useState('Đang giao'); // Vẫn giữ để filter nhưng Hoàn hàng dùng item.isReturned
  const [packagingFee, setPackagingFee] = useState(defaultPackagingCost);
  const [returnFee, setReturnFee] = useState(0);
  const [platformFee, setPlatformFee] = useState(0);
  const [marketingFee, setMarketingFee] = useState(0);
  const [actualRevenue, setActualRevenue] = useState('');
  const [settlementDate, setSettlementDate] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState([]);
  
  // New Item State
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedProductName, setSelectedProductName] = useState('');
  const [qty, setQty] = useState(1);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [isReturned, setIsReturned] = useState(false);
  
  const [importShop, setImportShop] = useState(defaultShop);
  const [importFixOrderId, setImportFixOrderId] = useState(null); // Đang sửa đơn nào từ danh sách "Đơn cần xử lý"
  const [isReconciling, setIsReconciling] = useState(false);
  const [isImportingOrders, setIsImportingOrders] = useState(false);

  useEffect(() => {
    if (!shop && defaultShop) setShop(defaultShop);
    if (!importShop && defaultShop) setImportShop(defaultShop);
  }, [defaultShop, shop, importShop]);

  useEffect(() => {
    if (!activeShop || !availableShops.includes(activeShop)) {
      setActiveShop(defaultShop);
    }
  }, [activeShop, availableShops, defaultShop]);

  // Đơn import bị lỗi (SKU không khớp hoặc lưu thất bại), giữ lại để người dùng sửa nhanh.
  const [importIssues, setImportIssues] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('orderImportIssues') || '[]');
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem('orderImportIssues', JSON.stringify(importIssues));
  }, [importIssues]);

  const fileInputRef = useRef(null); // Cho Đối soát Doanh thu
  const importInputRef = useRef(null); // Cho Import Đơn Hàng mới

  const handleProductSelect = (code) => {
    const val = code.toUpperCase();
    setSelectedProductId(val);
    // Match by the product code (SKU) the user sees, falling back to internal id.
    const prod = findProductByCode(products, val || code);
    if (prod) {
      setSelectedProductName(prod.name);
    }
  };

  const handleAddItem = () => {
    if (!selectedProductId || !selectedProductName || qty <= 0) return;

    // The user only enters/sees the product code (SKU), but store the internal id
    // so inventory/cost matching elsewhere keeps working.
    const prod = findProductByCode(products, selectedProductId);

    setItems([...items, {
      productId: prod ? prod.id : selectedProductId.toUpperCase(),
      sku: selectedProductId.toUpperCase(),
      name: selectedProductName,
      qty: Number(qty),
      sellingPrice: Number(sellingPrice),
      isReturned
    }]);

    setSelectedProductId('');
    setSelectedProductName('');
    setQty(1);
    setSellingPrice(0);
    setIsReturned(false);
  };

  const handleRemoveItem = (index) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const handleEditItem = (index) => {
    const item = items[index];
    const prod = findProductByCode(products, item.productId);
    // Prefer the SKU carried on the item; only fall back to a lookup / raw id.
    setSelectedProductId(item.sku || (prod ? (prod.sku || prod.id) : item.productId));
    setSelectedProductName(item.name);
    setQty(item.qty);
    setSellingPrice(item.sellingPrice);
    setIsReturned(item.isReturned || false);
    handleRemoveItem(index);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingOrderId(null);
    setImportFixOrderId(null);
    setItems([]);
    setOrderId('');
    setDate(new Date().toISOString().split('T')[0]);
    setShop(defaultShop);
    setStatus('Đang giao');
    setPackagingFee(defaultPackagingCost);
    setReturnFee(0);
    setPlatformFee(0);
    setMarketingFee(0);
    setActualRevenue('');
    setSettlementDate('');
    setNote('');
  };

  // Mở form tạo đơn, điền sẵn dữ liệu từ một đơn import bị lỗi để sửa nhanh.
  const handleFixImportIssue = (issue) => {
    const existingOrder = orders.find(order => order.id === issue.id);
    setEditingOrderId(null);
    setImportFixOrderId(issue.id);
    setOrderId(issue.id);
    setDate(issue.date);
    setShop(issue.shop);
    setStatus(issue.status || 'Đang giao');
    setPackagingFee(issue.packagingFee ?? defaultPackagingCost);
    setReturnFee(issue.returnFee || 0);
    setPlatformFee(issue.platformFee || 0);
    setMarketingFee(issue.marketingFee || 0);
    setActualRevenue(existingOrder?.actualRevenue !== null && existingOrder?.actualRevenue !== undefined ? existingOrder.actualRevenue : '');
    setSettlementDate(existingOrder?.settlementDate || '');
    setNote(issue.note || existingOrder?.note || '');
    setItems(issue.items.map(it => ({
      productId: it.productId,
      sku: it.productId,
      name: it.name,
      qty: it.qty,
      sellingPrice: it.sellingPrice,
      isReturned: it.isReturned
    })));
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveOrder = async () => {
    if (items.length === 0 || !orderId) return;

    // Validate manual save: ensure all products exist in inventory
    const invalidItems = items.filter(item => !products.find(p => p.id === item.productId));
    if (invalidItems.length > 0) {
      toast.error(`Các mã SP sau không có trong kho: ${invalidItems.map(i => i.productId).join(', ')}. Vui lòng chọn lại mã đúng!`);
      return;
    }

    const resolvedStatus = isFullyReturned(items)
      ? 'Hoàn hàng'
      : actualRevenue !== '' ? 'Đã giao' : (status === 'Hoàn hàng' ? 'Đang giao' : status);
    const orderData = {
      date,
      shop,
      status: resolvedStatus,
      packagingFee: Number(packagingFee) || 0,
      returnFee: Number(returnFee) || 0,
      platformFee: Number(platformFee) || 0,
      marketingFee: Number(marketingFee) || 0,
      actualRevenue: actualRevenue !== '' ? Number(actualRevenue) : null,
      settlementDate: settlementDate !== '' ? settlementDate : null,
      note: note.trim() || null,
      items,
      hasError: false // Đã sửa xong thì clear lỗi
    };

    const existingOrder = orders.find(order => order.id === orderId);
    const targetOrderId = editingOrderId || existingOrder?.id;

    setIsSavingOrder(true);
    try {
      if (targetOrderId) {
        const updated = await updateOrder(targetOrderId, orderData);
        if (!updated) return;
      } else {
        await addOrder({ id: orderId, ...orderData });
      }

      if (importFixOrderId) {
        setImportIssues(prev => prev.filter(issue => issue.id !== importFixOrderId));
      }
      toast.success(targetOrderId ? `Đã cập nhật đơn ${orderId}.` : `Đã tạo đơn ${orderId}.`);
      closeForm();
    } catch (err) {
      toast.error(`${targetOrderId ? 'Cập nhật' : 'Tạo'} đơn không thành công: ${err.message}`);
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleDeleteOrder = (order) => {
    setPendingOrderDelete(order);
  };

  const confirmDeleteOrder = async () => {
    if (!pendingOrderDelete) return;

    setIsDeletingOrder(true);
    try {
      await deleteOrder(pendingOrderDelete.id);
      toast.success(`Đã xóa đơn ${pendingOrderDelete.id}.`);
      setPendingOrderDelete(null);
    } catch (error) {
      toast.error(`Không thể xóa đơn: ${error.message}`);
    } finally {
      setIsDeletingOrder(false);
    }
  };

  const confirmClearImportIssues = () => {
    setImportIssues([]);
    setShowClearImportIssuesDialog(false);
    toast.success('Đã xóa danh sách đơn cần xử lý.');
  };

  const handleEditOrder = (o) => {
    setEditingOrderId(o.id);
    setOrderId(o.id);
    setDate(o.date);
    setShop(o.shop);
    setStatus(o.status);
    setPackagingFee(o.packagingFee ?? defaultPackagingCost);
    setReturnFee(o.returnFee || 0);
    setPlatformFee(o.platformFee || 0);
    setMarketingFee(o.marketingFee || 0);
    setActualRevenue(o.actualRevenue !== null && o.actualRevenue !== undefined ? o.actualRevenue : '');
    setSettlementDate(o.settlementDate || '');
    setNote(o.note || '');
    // Deep copy, and re-resolve each item's product so the code (SKU) always shows
    // correctly in the edit form even if the item's stored id/sku drifted.
    setItems(o.items.map(i => {
      const prod = findProductByCode(products, i.productId) || findProductByCode(products, i.sku);
      return { ...i, productId: prod?.id || i.productId, sku: i.sku || prod?.sku || i.productId };
    }));
    
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsReconciling(true);
    const toastId = toast.loading('Đang đối soát doanh thu...');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames.find(name => normalizeExcelText(name) === 'doanh thu') || wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
        const headerRow = rows.slice(0, 15).findIndex(row => {
          const normalized = row.map(normalizeExcelText);
          return normalized.includes('ma don hang') && normalized.some(value =>
            value === 'tong tien da thanh toan' || value.includes('doanh thu') || value.includes('thuc te') || value.includes('thu ve')
          );
        });
        if (headerRow < 0) throw new Error('Không tìm thấy dòng tiêu đề có Mã đơn hàng và doanh thu.');

        const headers = rows[headerRow];
        const idIndex = findHeaderIndex(headers, ['ma don hang', 'ma don', 'order id']);
        const revenueIndex = findHeaderIndex(headers, ['tong tien da thanh toan', 'doanh thu', 'thuc te', 'thu ve']);
        const dateIndex = findHeaderIndex(headers, ['ngay hoan thanh thanh toan', 'ngay doi soat', 'ngay thanh toan', 'ngay hoan thanh']);
        const typeIndex = findHeaderIndex(headers, ['don hang / san pham', 'order / sku', 'loai', 'type']);
        const returnFeeIndex = findHeaderIndex(headers, ['phi hoan', 'phi tra hang', 'phi van chuyen hoan', 'phi van chuyen tra']);
        if (idIndex < 0 || revenueIndex < 0) throw new Error('Thiếu cột Mã đơn hàng hoặc Tổng tiền đã thanh toán.');

        const orderById = new Map(orders.map(order => [normalizeExcelText(order.id), order]));
        const updatesByOrderId = new Map();
        let notFoundCount = 0;
        let skipCount = 0;
        let invalidCount = 0;

        rows.slice(headerRow + 1).forEach(row => {
          if (typeIndex >= 0 && normalizeExcelText(row[typeIndex]) !== 'order') {
            skipCount++;
            return;
          }

          const importedId = String(row[idIndex] ?? '').trim().replace(/^'/, '');
          const actualRevenue = parseExcelNumber(row[revenueIndex]);
          if (!importedId || actualRevenue === null) {
            invalidCount++;
            return;
          }

          const existingOrder = orderById.get(normalizeExcelText(importedId));
          if (!existingOrder) {
            notFoundCount++;
            return;
          }

          const updates = {
            actualRevenue,
            status: isFullyReturned(existingOrder.items) ? 'Hoàn hàng' : 'Đã giao'
          };
          const settlementDate = dateIndex >= 0 ? parseExcelDate(row[dateIndex]) : undefined;
          if (settlementDate) updates.settlementDate = settlementDate;
          if (returnFeeIndex >= 0) {
            const returnFee = parseExcelNumber(row[returnFeeIndex]);
            if (returnFee !== null) updates.returnFee = Math.abs(returnFee);
          }
          updatesByOrderId.set(existingOrder.id, updates);
        });

        for (const [id, updates] of updatesByOrderId) await updateOrder(id, updates);

        toast.success(
          `Hoàn tất đối soát!\n` +
          `- Cập nhật Thực tế (Nhận): ${updatesByOrderId.size} đơn\n` +
          `- Không tìm thấy mã đơn: ${notFoundCount} đơn\n` +
          `- Bỏ qua dòng sản phẩm: ${skipCount} dòng\n` +
          `- Dòng thiếu/sai dữ liệu: ${invalidCount} dòng`,
          { id: toastId }
        );
      } catch (err) {
        console.error(err);
        toast.error(`Không thể đối soát file Excel: ${err.message}`, { id: toastId });
      } finally {
        setIsReconciling(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = null;
        }
      }
    };
    reader.onerror = () => {
      setIsReconciling(false);
      toast.error('Không thể đọc file đối soát.', { id: toastId });
      if (fileInputRef.current) fileInputRef.current.value = null;
    };
    reader.readAsBinaryString(file);
  };

  const handleExcelImportOrders = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsImportingOrders(true);
    const toastId = toast.loading('Đang nhập đơn hàng...');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        const orderMap = {};
        
        data.forEach(row => {
          const keys = Object.keys(row);
          const getVal = (keywords) => {
            for (const keyword of keywords) {
              const normalizedKeyword = normalizeExcelText(keyword);
              const key = keys.find(candidate => normalizeExcelText(candidate).includes(normalizedKeyword));
              if (key) return row[key];
            }
            return undefined;
          };
          
          const rowId = getVal(['mã đơn hàng', 'mã đơn', 'order id']);
          if (!rowId) return; 
          
          const idStr = rowId.toString().trim();
          
          const statusText = getVal(['trạng thái đơn hàng', 'trạng thái', 'status']) || '';
          if (statusText.toLowerCase().includes('hủy')) return; // Bỏ qua đơn huỷ
          
          let mappedStatus = 'Đang giao';
          if (statusText.toLowerCase().includes('đã giao') || statusText.toLowerCase().includes('hoàn thành')) mappedStatus = 'Đã giao';
          if (statusText.toLowerCase().includes('trả hàng') || statusText.toLowerCase().includes('hoàn tiền')) mappedStatus = 'Đang giao';
          
          const dateRaw = getVal(['ngày đặt hàng', 'ngày đặt', 'thời gian']);
          let dateStr = new Date().toISOString().split('T')[0];
          if (dateRaw) {
            if (!isNaN(Number(dateRaw))) {
              const jsDate = new Date(Math.round((Number(dateRaw) - 25569) * 86400 * 1000));
              dateStr = jsDate.toISOString().split('T')[0];
            } else if (dateRaw.toString().includes('/')) {
              const parts = dateRaw.toString().split(/[\s/:-]+/);
              if (parts.length >= 3) {
                const day = parts[0].padStart(2, '0');
                const month = parts[1].padStart(2, '0');
                const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                dateStr = `${year}-${month}-${day}`;
              }
            } else {
              dateStr = dateRaw.toString().split(' ')[0];
            }
          }
          
          // Ưu tiên SKU phân loại hàng (variant) rồi mới tới SKU sản phẩm - không dựa vào thứ tự cột trong file.
          const sku = (getVal(['sku phân loại hàng']) || getVal(['sku sản phẩm']) || getVal(['mã sku', 'mã sp']) || '').toString();
          const name = (getVal(['tên sản phẩm', 'sản phẩm']) || 'Sản phẩm không tên').toString();
          const qty = Number(getVal(['số lượng', 'qty'])) || 1;
          
          // Shopee đặt cột Giá gốc trước Giá ưu đãi; luôn ưu tiên Giá ưu đãi theo tên cột.
          const priceRaw = getVal(['giá ưu đãi', 'giá bán', 'giá gốc']);
          const price = parseExcelNumber(priceRaw) ?? 0;
          
          // Đọc phí hoàn trực tiếp từ file (nếu có)
          const returnFeeRaw = getVal(['phí hoàn', 'phí trả hàng', 'phí vận chuyển hoàn', 'phí vận chuyển trả']);
          let parsedReturnFee = 0;
          if (returnFeeRaw !== undefined) {
             const feeStr = returnFeeRaw.toString().replace(/,/g, '');
             if (!isNaN(Number(feeStr))) parsedReturnFee = Math.abs(Number(feeStr));
            } else if (mappedStatus === 'Hoàn hàng') {
              parsedReturnFee = Number(defaultReturnFee) || 0; // Fallback
            }
          
          // Đọc phí sàn (phí dịch vụ, phí cố định, phí thanh toán, phí giao dịch...)
          const parseFee = (keywords) => {
            let total = 0;
            keys.forEach(k => {
              const kl = k.toLowerCase();
              if (keywords.some(kw => kl.includes(kw))) {
                const valStr = row[k]?.toString().replace(/,/g, '');
                if (valStr && !isNaN(Number(valStr))) {
                  total += Math.abs(Number(valStr));
                }
              }
            });
            return total;
          };
          
          const parsedPlatformFee = parseFee(['phí dịch vụ', 'phí cố định', 'phí thanh toán', 'phí giao dịch', 'phí xử lý']);
          const parsedMarketingFee = parseFee(['mã giảm giá của shop', 'shop trợ giá', 'khuyến mãi của shop']);
          
          if (!orderMap[idStr]) {
            orderMap[idStr] = {
              id: idStr,
              date: dateStr,
              shop: importShop, // Gán Kênh Bán theo lựa chọn trên giao diện
              status: mappedStatus,
              packagingFee: Number(defaultPackagingCost) || 0,
              returnFee: parsedReturnFee,
              platformFee: parsedPlatformFee,
              marketingFee: parsedMarketingFee,
              items: [],
              hasError: false
            };
          } else {
             // Cập nhật thêm nếu có nhiều dòng (Shopee hay tách ra nhiều dòng sản phẩm)
             if (parsedPlatformFee > 0 && !orderMap[idStr].platformFee) orderMap[idStr].platformFee = parsedPlatformFee;
             if (parsedMarketingFee > 0 && !orderMap[idStr].marketingFee) orderMap[idStr].marketingFee = parsedMarketingFee;
          }
          
          const rawSku = sku ? sku.trim().toUpperCase() : '';
          // Resolve về SKU/UUID sản phẩm thật trong kho, giống luồng nhập tay (handleAddItem).
          const prod = rawSku ? findProductByCode(products, rawSku) : null;
          const productId = prod ? prod.id : rawSku;

          orderMap[idStr].items.push({
            productId: productId,
            sku: rawSku,
            name: name,
            qty: qty,
            sellingPrice: price,
            isReturned: false
          });

          // Đánh dấu lỗi nếu SKU rỗng hoặc SKU không khớp với sản phẩm nào trong kho
          if (!rawSku || !prod) {
            orderMap[idStr].hasError = true;
          }
        });
        
        let successCount = 0;
        let updatedCount = 0;
        const newIssues = [];

        for (const orderData of Object.values(orderMap)) {
          if (orderData.items.length === 0) continue;

          if (orderData.hasError) {
            // Không gọi API cho đơn chắc chắn sẽ bị từ chối - đưa thẳng vào danh sách cần xử lý.
            const badItems = orderData.items.filter(it => !products.find(p => p.id === it.productId));
            newIssues.push({
              ...orderData,
              reason: `Mã SP không khớp sản phẩm trong kho: ${badItems.map(it => `${it.name} (${it.productId || 'trống'})`).join(', ')}`
            });
            continue;
          }

          try {
            const existingOrder = orders.find(order => order.id === orderData.id);
            if (existingOrder) {
              const updated = await updateOrder(orderData.id, {
                ...orderData,
                actualRevenue: existingOrder.actualRevenue ?? null,
                settlementDate: existingOrder.settlementDate ?? null,
              });
              if (!updated) throw new Error('Cập nhật giá bán thất bại');
              updatedCount++;
            } else {
              await addOrder(orderData);
              successCount++;
            }
          } catch (err) {
            newIssues.push({ ...orderData, reason: err.message || 'Lỗi không xác định' });
          }
        }

        if (newIssues.length > 0) {
          setImportIssues(prev => {
            const prevFiltered = prev.filter(p => !newIssues.find(n => n.id === p.id));
            return [...prevFiltered, ...newIssues];
          });
        }

        let msg = `✅ Đã thêm ${successCount} đơn mới và cập nhật giá bán cho ${updatedCount} đơn trùng mã.`;
        if (newIssues.length > 0) {
          msg += `\n⚠️ ${newIssues.length} đơn cần xử lý (mã SP không khớp hoặc lưu thất bại). Xem danh sách "Đơn cần xử lý" bên dưới để sửa nhanh.`;
        }
        toast.success(msg, { id: toastId });
      } catch (err) {
        console.error(err);
        toast.error(`Có lỗi xảy ra khi đọc file Excel: ${err.message}`, { id: toastId });
      } finally {
        setIsImportingOrders(false);
      }
      e.target.value = null;
    };
    reader.onerror = () => {
      setIsImportingOrders(false);
      toast.error('Không thể đọc file đơn hàng.', { id: toastId });
      e.target.value = null;
    };
    reader.readAsBinaryString(file);
  };

  const shopOrders = orders.filter(o => o.shop === activeShop);
  const filteredOrders = shopOrders.filter(o => {
    const normalizedSearch = search.toLocaleLowerCase('vi');
    const matchSearch = o.id.toLocaleLowerCase('vi').includes(normalizedSearch)
      || o.shop.toLocaleLowerCase('vi').includes(normalizedSearch)
      || String(o.note || '').toLocaleLowerCase('vi').includes(normalizedSearch);
    let matchDate = true;
    if (startDate) matchDate = matchDate && o.date >= startDate;
    if (endDate) matchDate = matchDate && o.date <= endDate;
    let matchRecon = true;
    if (reconFilter === 'reconciled') matchRecon = o.actualRevenue !== null && o.actualRevenue !== undefined;
    if (reconFilter === 'unreconciled') matchRecon = o.actualRevenue === null || o.actualRevenue === undefined;
    const matchProfit = profitFilter !== 'negative' || calculateOrderGrossProfit(o) < 0;
    const fullReturn = isFullyReturned(o.items);
    let matchDelivery = true;
    if (deliveryFilter === 'returned') matchDelivery = fullReturn;
    if (deliveryFilter === 'delivered') matchDelivery = !fullReturn && o.actualRevenue !== null && o.actualRevenue !== undefined;
    
    return matchSearch && matchDate && matchRecon && matchProfit && matchDelivery;
  }).sort((a, b) => {
    const dateCompare = dateSort === 'newest'
      ? String(b.date || '').localeCompare(String(a.date || ''))
      : String(a.date || '').localeCompare(String(b.date || ''));
    if (dateCompare !== 0) return dateCompare;
    return dateSort === 'newest'
      ? String(b.id || '').localeCompare(String(a.id || ''))
      : String(a.id || '').localeCompare(String(b.id || ''));
  });

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Xuất Bán (Đơn hàng)"
        description="Quản lý đơn, hoàn hàng 1 phần và đối soát tự động qua Excel"
        actions={!showForm ? (
          <div className="header-actions">
            <input type="file" accept=".xlsx, .xls, .csv" style={{ display: 'none' }} ref={fileInputRef} onChange={handleExcelUpload} />
            <input type="file" accept=".xlsx, .xls, .csv" style={{ display: 'none' }} ref={importInputRef} onChange={handleExcelImportOrders} />
            
            <div className="import-control">
              <select value={importShop} onChange={e => setImportShop(e.target.value)}>
                {availableShops.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {can('orders', 'create') && <Button variant="secondary" icon={Upload} loading={isImportingOrders} style={{ border: 'none', borderColor: 'transparent', color: 'var(--color-primary)' }} onClick={() => importInputRef.current.click()}>
                {isImportingOrders ? 'Đang nhập...' : 'Import Đơn Mới'}
              </Button>}
            </div>

            {can('orders', 'update') && <Button variant="secondary" icon={Upload} loading={isReconciling} style={{ borderColor: 'var(--color-success)', color: 'var(--color-success)' }} onClick={() => fileInputRef.current.click()}>
              {isReconciling ? 'Đang đối soát...' : 'Đối Soát (Excel)'}
            </Button>}
            {can('orders', 'create') && <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={18} /> Nhập Đơn Tay
            </button>}
          </div>
        ) : null}
      />

      {showForm && (
        <div className="card animate-fade-in" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h3>{editingOrderId ? `Sửa Đơn Hàng: ${editingOrderId}` : importFixOrderId ? `Xử Lý Đơn Lỗi Import: ${importFixOrderId}` : 'Tạo Đơn Hàng Mới'}</h3>
            <button className="btn btn-outline" onClick={closeForm}><X size={16} /> Hủy</button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div>
              <label style={labelStyle}>Mã Đơn Hàng</label>
              <input type="text" placeholder="VD: ORD-001" value={orderId} onChange={e => setOrderId(e.target.value)} disabled={!!editingOrderId} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Ngày Bán</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Kênh Bán</label>
              <select value={shop} onChange={e => setShop(e.target.value)} style={inputStyle}>
                {availableShops.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Trạng thái (Cả đơn)</label>
              <select value={status} onChange={e => {
                setStatus(e.target.value);
                if (e.target.value === 'Hoàn hàng' && returnFee === 0) setReturnFee(defaultReturnFee);
              }} style={inputStyle}>
                <option value="Đang giao">Đang giao</option>
                <option value="Đã giao">Đã giao</option>
                <option value="Hoàn hàng">Hoàn hàng toàn bộ</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Phí đóng gói (VNĐ)</label>
              <input type="number" step="1000" value={packagingFee} onChange={e => setPackagingFee(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phí hoàn (VNĐ)</label>
              <input type="number" step="1000" value={returnFee} onChange={e => setReturnFee(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phí sàn (VNĐ) <span style={{ fontSize: '0.7rem', fontWeight: 400 }}>(Tự động đọc)</span></label>
              <input type="number" step="1000" value={platformFee} onChange={e => setPlatformFee(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phí Marketing (VNĐ) <span style={{ fontSize: '0.7rem', fontWeight: 400 }}>(Tự động đọc)</span></label>
              <input type="number" step="1000" value={marketingFee} onChange={e => setMarketingFee(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{...labelStyle, color: 'var(--color-primary)'}}>Ngày nhận tiền</label>
              <input type="date" value={settlementDate} onChange={e => setSettlementDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{...labelStyle, color: 'var(--color-primary)'}}>Doanh thu Thực tế (VNĐ)</label>
              <input type="number" step="1000" placeholder="Chưa đối soát..." value={actualRevenue} onChange={e => setActualRevenue(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Ghi chú đơn hàng</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Ghi lại vấn đề của đơn: thiếu hàng, khách đổi mẫu, cần theo dõi khiếu nại..."
                style={{ ...inputStyle, resize: 'vertical', minHeight: '76px' }}
              />
            </div>
          </div>

          <div style={{ padding: '1.5rem', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
            <h4 style={{ marginBottom: '1rem' }}>Thêm Sản Phẩm</h4>
            <datalist id="products-list">
              {products.map(p => (
                <option key={p.id} value={p.sku || p.id}>{p.name}</option>
              ))}
            </datalist>
            
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 120px' }}>
                <label style={labelStyle}>Mã SP</label>
                <input list="products-list" type="text" placeholder="Gõ để chọn" value={selectedProductId} onChange={e => handleProductSelect(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ flex: '2 1 180px' }}>
                <label style={labelStyle}>Tên SP</label>
                <input type="text" value={selectedProductName} onChange={e => setSelectedProductName(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ width: '80px' }}>
                <label style={labelStyle}>SL</label>
                <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ width: '130px' }}>
                <label style={labelStyle}>Giá Bán (VNĐ)</label>
                <input type="number" step="1000" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', height: '42px', padding: '0 0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 500, color: 'var(--color-danger)' }}>
                  <input type="checkbox" checked={isReturned} onChange={e => setIsReturned(e.target.checked)} style={{ marginRight: '0.5rem' }} />
                  Bị hoàn trả
                </label>
              </div>
              {can('orders', editingOrderId || importFixOrderId ? 'update' : 'create') && <button className="btn btn-outline" onClick={handleAddItem} style={{ height: '42px' }}><Plus size={16} /> Thêm</button>}
            </div>
          </div>

          {items.length > 0 && (
            <div className="table-container" style={{ marginBottom: '1.5rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th>SL</th>
                    <th>Giá Bán</th>
                    <th>Doanh thu</th>
                    <th>Trạng thái</th>
                    <th style={{ textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const prod = products.find(p => p.id === item.productId);
                    return (
                    <tr key={idx} style={{ opacity: item.isReturned ? 0.6 : 1 }}>
                      <td>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                          <ProductImage imageId={prod?.imageId} size={32} />
                          <div>
                            <div style={{ fontWeight: 600 }}>{prod?.name || item.name || 'Sản phẩm không xác định'}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{item.sku || prod?.sku || item.productId}</div>
                          </div>
                        </div>
                      </td>
                      <td>{item.qty}</td>
                      <td>{item.sellingPrice.toLocaleString()} đ</td>
                      <td style={{ fontWeight: 700 }}>
                        {(item.qty * item.sellingPrice).toLocaleString()} đ
                      </td>
                      <td>
                        {item.isReturned ? <span className="badge badge-danger">Đã hoàn trả</span> : <span className="badge badge-success">Đã bán</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {can('orders', editingOrderId || importFixOrderId ? 'update' : 'create') && <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', marginRight: '0.5rem' }} onClick={() => handleEditItem(idx)}>Sửa</button>}
                        {can('orders', editingOrderId || importFixOrderId ? 'update' : 'create') && <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }} onClick={() => handleRemoveItem(idx)}>Xoá</button>}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {can('orders', editingOrderId || importFixOrderId ? 'update' : 'create') && <Button icon={Save} loading={isSavingOrder} onClick={handleSaveOrder} disabled={items.length === 0 || !orderId}>
              {isSavingOrder ? 'Đang lưu...' : 'Lưu Đơn Hàng'}
            </Button>}
          </div>
        </div>
      )}

      {importIssues.length > 0 && !showForm && (
        <div className="card" style={{ padding: 0, marginBottom: '2rem', border: '1px solid var(--color-danger)' }}>
          <div style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)' }}>
            <h3 style={{ color: 'var(--color-danger)', margin: 0 }}>⚠️ {importIssues.length} đơn cần xử lý từ lần import gần nhất</h3>
            <button
              className="btn btn-outline"
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
              onClick={() => setShowClearImportIssuesDialog(true)}
            >
              Xóa danh sách
            </button>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Ngày</th>
                  <th>Lý do</th>
                  <th style={{ width: '140px', textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {importIssues.map(issue => (
                  <tr key={issue.id}>
                    <td style={{ fontWeight: 600 }}>{issue.id}</td>
                    <td>{issue.date}</td>
                    <td style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{issue.reason}</td>
                    <td style={{ textAlign: 'center' }}>
                      {can('orders', 'update') && <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', marginRight: '0.5rem' }} onClick={() => handleFixImportIssue(issue)}>Sửa</button>}
                      <button
                        className="btn btn-outline"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                        onClick={() => setImportIssues(prev => prev.filter(i => i.id !== issue.id))}
                      >
                        Bỏ qua
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Danh sách đơn hàng */}
      <div className="card" style={{ padding: 0 }}>
        <div className="shop-tabs" role="tablist" aria-label="Đơn hàng theo shop">
          {availableShops.map(shopName => {
            const orderCount = orders.filter(order => order.shop === shopName).length;
            const isActive = activeShop === shopName;
            return (
              <button
                key={shopName}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`shop-tab${isActive ? ' active' : ''}`}
                onClick={() => {
                  setActiveShop(shopName);
                  setShop(shopName);
                  setImportShop(shopName);
                  setExpandedOrderId(null);
                }}
              >
                <span>{shopName}</span>
                <span className="shop-tab-count">{orderCount}</span>
              </button>
            );
          })}
        </div>
        <div style={{ padding: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ flex: '1 1 250px', position: 'relative' }}>
            <label style={labelStyle}>Tìm kiếm</label>
            <Search size={18} style={{ position: 'absolute', left: '1rem', bottom: '12px', color: 'var(--color-text-muted)' }} />
            <input type="text" placeholder="Mã đơn, ghi chú..." value={search} onChange={(e) => setSearch(e.target.value)} style={{...inputStyle, paddingLeft: '2.5rem'}} />
          </div>
          <div>
            <label style={labelStyle}>Từ ngày</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Đến ngày</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Trạng thái đối soát</label>
            <select value={reconFilter} onChange={e => setReconFilter(e.target.value)} style={inputStyle}>
              <option value="all">Tất cả</option>
              <option value="unreconciled">Chưa có Doanh Thu Thực Tế</option>
              <option value="reconciled">Đã đối soát</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Lợi nhuận gộp</label>
            <select value={profitFilter} onChange={e => setProfitFilter(e.target.value)} style={inputStyle}>
              <option value="all">Tất cả</option>
              <option value="negative">Chỉ đơn bị âm</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Trạng thái giao hàng</label>
            <select value={deliveryFilter} onChange={e => setDeliveryFilter(e.target.value)} style={inputStyle}>
              <option value="all">Tất cả</option>
              <option value="returned">Đơn bị hoàn</option>
              <option value="delivered">Đơn đã giao</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Sắp xếp theo ngày</label>
            <select value={dateSort} onChange={e => setDateSort(e.target.value)} style={inputStyle}>
              <option value="newest">Ngày mới nhất</option>
              <option value="oldest">Ngày cũ nhất</option>
            </select>
          </div>
        </div>

        <div aria-live="polite" style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.875rem', fontWeight: 600 }}>
          Shop <span style={{ color: 'var(--color-text-base)' }}>{activeShop || 'Chưa cấu hình'}</span>: đang hiển thị <span style={{ color: 'var(--color-text-base)' }}>{filteredOrders.length}</span> / {shopOrders.length} đơn
        </div>

        <div className="table-container orders-table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th>Mã Đơn</th>
                <th>Kênh Bán</th>
                <th>Ngày Đặt</th>
                <th>Tổng Giá Bán</th>
                <th style={{ color: 'var(--color-primary)' }}>Phí Đóng gói</th>
                <th style={{ color: 'var(--color-danger)' }}>Phí Hoàn</th>
                <th style={{ color: 'var(--color-primary)' }}>Thực Tế (Nhận)</th>
                <th style={{ color: 'var(--color-primary)' }}>Ngày Nhận</th>
                <th>Tổng Lợi Nhuận Gộp</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                    Không tìm thấy đơn hàng nào phù hợp bộ lọc.
                  </td>
                </tr>
              )}
              {filteredOrders.map(o => {
                const totalRevenue = o.items.reduce((sum, item) => sum + (item.isReturned ? 0 : (item.qty * item.sellingPrice)), 0);
                const profit = calculateOrderGrossProfit(o);
                const isExpanded = expandedOrderId === o.id;

                return (
                  <React.Fragment key={o.id}>
                    <tr style={{ cursor: 'pointer', backgroundColor: o.hasError ? 'var(--color-danger-light)' : (isExpanded ? 'var(--color-bg-hover)' : '') }} onClick={() => setExpandedOrderId(isExpanded ? null : o.id)}>
                      <td>
                        {isExpanded ? <span style={{fontSize: '12px'}}>▼</span> : <span style={{fontSize: '12px'}}>▶</span>}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {o.id}
                        {o.hasError && <span style={{display: 'block', fontSize: '0.7rem', color: 'var(--color-danger)'}}>Lỗi Mã SP</span>}
                      </td>
                      <td>{o.shop}</td>
                      <td>{o.date}</td>
                      <td style={{ fontWeight: 600 }}>{totalRevenue.toLocaleString()} đ</td>
                      <td>
                        <input 
                          type="number"
                          defaultValue={o.packagingFee ?? defaultPackagingCost}
                          onBlur={(e) => updateOrder(o.id, { packagingFee: Number(e.target.value) || 0 })}
                          style={{ ...inputStyle, padding: '0.25rem 0.5rem', width: '70px', height: '30px' }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td>
                        <input 
                          type="number"
                          defaultValue={o.returnFee || 0}
                          onBlur={(e) => updateOrder(o.id, { returnFee: Number(e.target.value) || 0 })}
                          style={{ ...inputStyle, padding: '0.25rem 0.5rem', width: '70px', height: '30px' }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                        {o.actualRevenue !== null && o.actualRevenue !== undefined ? o.actualRevenue.toLocaleString() + ' đ' : '-'}
                      </td>
                      <td style={{ color: 'var(--color-primary)', fontSize: '0.875rem' }}>
                        {o.settlementDate || '-'}
                      </td>
                      <td style={{ fontWeight: 600, color: profit > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {profit.toLocaleString()} đ
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {can('orders', 'update') && <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', marginRight: '0.5rem' }} onClick={(e) => { e.stopPropagation(); handleEditOrder(o); }}>
                          Sửa
                        </button>}
                        {can('orders', 'delete') && <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }} onClick={(e) => { e.stopPropagation(); handleDeleteOrder(o); }}>
                          Xóa
                        </button>}
                      </td>
                    </tr>
                    
                    {isExpanded && (
                      <tr>
                        <td colSpan={11} style={{ padding: 0, backgroundColor: 'var(--color-bg-base)' }}>
                          <div style={{ padding: '1rem 3rem', borderLeft: '4px solid var(--color-primary)' }}>
                            <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem' }}>
                              <div style={{ fontSize: '0.875rem' }}><span style={{ color: 'var(--color-text-muted)' }}>Trạng thái giao:</span> <span style={{ fontWeight: 600 }}>{o.status}</span></div>
                              <div style={{ fontSize: '0.875rem' }}><span style={{ color: 'var(--color-text-muted)' }}>Phí đóng gói:</span> <span style={{ fontWeight: 600 }}>{(o.packagingFee ?? defaultPackagingCost).toLocaleString()} đ</span></div>
                              <div style={{ fontSize: '0.875rem' }}><span style={{ color: 'var(--color-text-muted)' }}>Phí hoàn:</span> <span style={{ fontWeight: 600, color: 'var(--color-danger)' }}>{(o.returnFee || 0).toLocaleString()} đ</span></div>
                              <div style={{ fontSize: '0.875rem' }}><span style={{ color: 'var(--color-text-muted)' }}>Tổng Giá Vốn (Gồm Đóng gói & Phí hoàn):</span> <span style={{ fontWeight: 600, color: 'var(--color-danger)' }}>{(o.totalCost || 0).toLocaleString()} đ</span></div>
                            </div>
                            {o.note && (
                              <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-warning-light)', color: 'var(--color-text-base)', whiteSpace: 'pre-wrap' }}>
                                <strong>Ghi chú:</strong> {o.note}
                              </div>
                            )}
                            
                            <table style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                              <thead>
                                <tr>
                                  <th style={{ background: 'transparent', padding: '0.5rem 1rem' }}>Sản phẩm</th>
                                  <th style={{ background: 'transparent', padding: '0.5rem 1rem' }}>SL</th>
                                  <th style={{ background: 'transparent', padding: '0.5rem 1rem' }}>Giá Bán (1c)</th>
                                  <th style={{ background: 'transparent', padding: '0.5rem 1rem' }}>Tổng Giá Bán</th>
                                  <th style={{ background: 'transparent', padding: '0.5rem 1rem' }}>T.Thái Bán</th>
                                  <th style={{ background: 'transparent', padding: '0.5rem 1rem' }}>Giá Vốn Đơn Vị (1c)</th>
                                  <th style={{ background: 'transparent', padding: '0.5rem 1rem' }}>Tổng Vốn Dòng Này</th>
                                </tr>
                              </thead>
                              <tbody>
                                {o.items.map((item, idx) => {
                                  const prod = products.find(p => p.id === item.productId);
                                  const unitCost = item.qty > 0 && item.totalCostDeducted ? Math.round(item.totalCostDeducted / item.qty) : 0;
                                  return (
                                    <tr key={idx} style={{ opacity: item.isReturned ? 0.5 : 1 }}>
                                      <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
                                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                          <ProductImage imageId={prod?.imageId} size={32} />
                                          <div>
                                            <div style={{ fontWeight: 500 }}>{prod?.name || item.name || 'Sản phẩm không xác định'}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{item.sku || prod?.sku || item.productId}</div>
                                          </div>
                                        </div>
                                      </td>
                                      <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)' }}>{item.qty}</td>
                                      <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)', fontWeight: 600, color: 'var(--color-primary)' }}>
                                        {(Number(item.sellingPrice) || 0).toLocaleString()} đ
                                      </td>
                                      <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)', fontWeight: 600, color: 'var(--color-primary)' }}>
                                        {item.isReturned ? '0 đ' : `${((Number(item.sellingPrice) || 0) * item.qty).toLocaleString()} đ`}
                                      </td>
                                      <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
                                        {item.isReturned ? <span className="badge badge-danger">Hoàn trả</span> : <span className="badge badge-success">Đã bán</span>}
                                      </td>
                                      <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)' }}>{item.isReturned ? '0 đ' : `${unitCost.toLocaleString()} đ`}</td>
                                      <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)', fontWeight: 600 }}>{item.isReturned ? '0 đ' : `${(item.totalCostDeducted || 0).toLocaleString()} đ`}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(pendingOrderDelete)}
        onClose={() => !isDeletingOrder && setPendingOrderDelete(null)}
        onConfirm={confirmDeleteOrder}
        title="Xóa đơn hàng"
        itemName={pendingOrderDelete?.id}
        description={pendingOrderDelete ? `Xóa đơn “${pendingOrderDelete.id}”? Tồn kho đã xuất của đơn này sẽ được hoàn lại.` : undefined}
        loading={isDeletingOrder}
      />
      <ConfirmDialog
        open={showClearImportIssuesDialog}
        onClose={() => setShowClearImportIssuesDialog(false)}
        onConfirm={confirmClearImportIssues}
        title="Xóa danh sách đơn cần xử lý"
        itemName="toàn bộ danh sách"
        description="Xóa toàn bộ danh sách đơn cần xử lý?"
      />
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '0.75rem 1rem',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg-base)',
  color: 'var(--color-text-base)',
  outline: 'none',
  boxSizing: 'border-box'
};

const labelStyle = {
  display: 'block', 
  fontSize: '0.875rem', 
  marginBottom: '0.5rem',
  fontWeight: 500
};
