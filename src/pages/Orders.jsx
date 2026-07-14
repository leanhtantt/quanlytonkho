import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/appStoreContext';
import { IconAlertTriangle, IconEdit as Edit, IconPlus as Plus, IconDeviceFloppy as Save, IconTrash as Trash2, IconUpload as Upload, IconX as X } from '@tabler/icons-react';
import * as XLSX from 'xlsx';
import ProductImage from '../components/ProductImage';
import { calculateOrderGrossProfit } from '../domain/profitAnalytics';
import { findProductByCode } from '../domain/productSku';
import { toast } from '../components/ui/toastHelper';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import FormField from '../components/ui/FormField';
import SearchInput from '../components/ui/SearchInput';
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
  const [updatingFeeKey, setUpdatingFeeKey] = useState(null);
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

  const handleInlineFeeUpdate = async (order, field, value) => {
    const feeKey = `${order.id}-${field}`;
    setUpdatingFeeKey(feeKey);
    try {
      await updateOrder(order.id, { [field]: Number(value) || 0 });
      toast.success(`Đã cập nhật ${field === 'packagingFee' ? 'phí đóng gói' : 'phí hoàn'} của đơn ${order.id}.`);
    } catch (error) {
      toast.error(`Không thể cập nhật đơn ${order.id}: ${error.message}`);
    } finally {
      setUpdatingFeeKey(null);
    }
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
    <div className="animate-fade-in orders-page">
      <PageHeader
        title="Xuất Bán (Đơn hàng)"
        description="Quản lý đơn, hoàn hàng 1 phần và đối soát tự động qua Excel"
        actions={!showForm ? (
          <div className="header-actions">
            <input className="ui-visually-hidden" type="file" accept=".xlsx, .xls, .csv" ref={fileInputRef} onChange={handleExcelUpload} />
            <input className="ui-visually-hidden" type="file" accept=".xlsx, .xls, .csv" ref={importInputRef} onChange={handleExcelImportOrders} />
            
            <div className="import-control">
              <select value={importShop} onChange={e => setImportShop(e.target.value)}>
                {availableShops.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {can('orders', 'create') && <Button variant="secondary" icon={Upload} loading={isImportingOrders} onClick={() => importInputRef.current.click()}>
                {isImportingOrders ? 'Đang nhập...' : 'Import Đơn Mới'}
              </Button>}
            </div>

            {can('orders', 'update') && <Button variant="secondary" icon={Upload} loading={isReconciling} onClick={() => fileInputRef.current.click()}>
              {isReconciling ? 'Đang đối soát...' : 'Đối Soát (Excel)'}
            </Button>}
            {can('orders', 'create') && <Button icon={Plus} onClick={() => setShowForm(true)}>Nhập Đơn Tay</Button>}
          </div>
        ) : null}
      />

      {showForm && (
        <section className="card animate-fade-in orders-form-card">
          <div className="orders-section-heading">
            <h3>{editingOrderId ? `Sửa Đơn Hàng: ${editingOrderId}` : importFixOrderId ? `Xử Lý Đơn Lỗi Import: ${importFixOrderId}` : 'Tạo Đơn Hàng Mới'}</h3>
            <Button variant="secondary" icon={X} onClick={closeForm}>Hủy</Button>
          </div>
          
          <div className="orders-form-grid">
            <FormField label="Mã Đơn Hàng"><input type="text" placeholder="VD: ORD-001" value={orderId} onChange={e => setOrderId(e.target.value)} disabled={!!editingOrderId} /></FormField>
            <FormField label="Ngày Bán"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></FormField>
            <FormField label="Kênh Bán">
              <select value={shop} onChange={e => setShop(e.target.value)}>
                {availableShops.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormField>
            <FormField label="Trạng thái (Cả đơn)">
              <select value={status} onChange={e => {
                setStatus(e.target.value);
                if (e.target.value === 'Hoàn hàng' && returnFee === 0) setReturnFee(defaultReturnFee);
              }}>
                <option value="Đang giao">Đang giao</option>
                <option value="Đã giao">Đã giao</option>
                <option value="Hoàn hàng">Hoàn hàng toàn bộ</option>
              </select>
            </FormField>
            <FormField label="Phí đóng gói (VNĐ)"><input className="num" type="number" step="1000" value={packagingFee} onChange={e => setPackagingFee(e.target.value)} /></FormField>
            <FormField label="Phí hoàn (VNĐ)"><input className="num" type="number" step="1000" value={returnFee} onChange={e => setReturnFee(e.target.value)} /></FormField>
            <FormField label="Phí sàn (VNĐ)" helpText="Tự động đọc"><input className="num" type="number" step="1000" value={platformFee} onChange={e => setPlatformFee(e.target.value)} /></FormField>
            <FormField label="Phí Marketing (VNĐ)" helpText="Tự động đọc"><input className="num" type="number" step="1000" value={marketingFee} onChange={e => setMarketingFee(e.target.value)} /></FormField>
            <FormField label="Ngày nhận tiền" className="orders-form-field--settlement"><input type="date" value={settlementDate} onChange={e => setSettlementDate(e.target.value)} /></FormField>
            <FormField label="Doanh thu Thực tế (VNĐ)" className="orders-form-field--settlement"><input className="num" type="number" step="1000" placeholder="Chưa đối soát..." value={actualRevenue} onChange={e => setActualRevenue(e.target.value)} /></FormField>
            <FormField label="Ghi chú đơn hàng" className="orders-form-grid__wide">
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Ghi lại vấn đề của đơn: thiếu hàng, khách đổi mẫu, cần theo dõi khiếu nại..."
              />
            </FormField>
          </div>

          <div className="orders-item-editor">
            <h4>Thêm Sản Phẩm</h4>
            <datalist id="products-list">
              {products.map(p => (
                <option key={p.id} value={p.sku || p.id}>{p.name}</option>
              ))}
            </datalist>
            
            <div className="orders-item-editor__grid">
              <FormField label="Mã SP"><input list="products-list" type="text" placeholder="Gõ để chọn" value={selectedProductId} onChange={e => handleProductSelect(e.target.value)} /></FormField>
              <FormField label="Tên SP" className="orders-item-editor__name"><input type="text" value={selectedProductName} onChange={e => setSelectedProductName(e.target.value)} /></FormField>
              <FormField label="SL"><input className="num" type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} /></FormField>
              <FormField label="Giá Bán (VNĐ)"><input className="num" type="number" step="1000" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} /></FormField>
              <div className="orders-return-toggle">
                <label>
                  <input type="checkbox" checked={isReturned} onChange={e => setIsReturned(e.target.checked)} />
                  Bị hoàn trả
                </label>
              </div>
              {can('orders', editingOrderId || importFixOrderId ? 'update' : 'create') && <Button variant="secondary" icon={Plus} onClick={handleAddItem}>Thêm</Button>}
            </div>
          </div>

          {items.length > 0 && (
            <div className="table-container orders-form-items">
              <table>
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th>SL</th>
                    <th>Giá Bán</th>
                    <th>Doanh thu</th>
                    <th>Trạng thái</th>
                    <th className="orders-actions-cell">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const prod = products.find(p => p.id === item.productId);
                    return (
                    <tr key={idx} className={item.isReturned ? 'is-returned' : ''}>
                      <td>
                        <div className="orders-product-cell">
                          <ProductImage imageId={prod?.imageId} size={32} />
                          <div>
                            <div className="orders-product-name">{prod?.name || item.name || 'Sản phẩm không xác định'}</div>
                            <div className="orders-product-code">{item.sku || prod?.sku || item.productId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="num">{item.qty}</td>
                      <td className="num">{item.sellingPrice.toLocaleString()} đ</td>
                      <td className="num orders-value-strong">
                        {(item.qty * item.sellingPrice).toLocaleString()} đ
                      </td>
                      <td>
                        {item.isReturned ? <Badge variant="danger">Đã hoàn trả</Badge> : <Badge variant="success">Đã bán</Badge>}
                      </td>
                      <td className="orders-actions-cell">
                        <div className="orders-row-actions">
                          {can('orders', editingOrderId || importFixOrderId ? 'update' : 'create') && <Button variant="ghost" size="sm" icon={Edit} onClick={() => handleEditItem(idx)}>Sửa</Button>}
                          {can('orders', editingOrderId || importFixOrderId ? 'update' : 'create') && <Button variant="danger" size="sm" icon={Trash2} onClick={() => handleRemoveItem(idx)}>Xoá</Button>}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="orders-form-actions">
            {can('orders', editingOrderId || importFixOrderId ? 'update' : 'create') && <Button icon={Save} loading={isSavingOrder} onClick={handleSaveOrder} disabled={items.length === 0 || !orderId}>
              {isSavingOrder ? 'Đang lưu...' : 'Lưu Đơn Hàng'}
            </Button>}
          </div>
        </section>
      )}

      {importIssues.length > 0 && !showForm && (
        <section className="card orders-import-issues">
          <div className="orders-import-issues__heading">
            <h3><IconAlertTriangle size={22} aria-hidden="true" /> {importIssues.length} đơn cần xử lý từ lần import gần nhất</h3>
            <Button variant="danger" size="sm" icon={Trash2} onClick={() => setShowClearImportIssuesDialog(true)}>Xóa danh sách</Button>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Ngày</th>
                  <th>Lý do</th>
                  <th className="orders-actions-cell">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {importIssues.map(issue => (
                  <tr key={issue.id}>
                    <td className="orders-value-strong">{issue.id}</td>
                    <td>{issue.date}</td>
                    <td className="orders-import-issues__reason">{issue.reason}</td>
                    <td className="orders-actions-cell">
                      <div className="orders-row-actions">
                        {can('orders', 'update') && <Button variant="ghost" size="sm" icon={Edit} onClick={() => handleFixImportIssue(issue)}>Sửa</Button>}
                        <Button variant="danger" size="sm" icon={Trash2} onClick={() => setImportIssues(prev => prev.filter(i => i.id !== issue.id))}>Bỏ qua</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Danh sách đơn hàng */}
      <section className="card orders-list-card">
        <div className="shop-tabs" role="tablist" aria-label="Đơn hàng theo shop">
          {availableShops.map(shopName => {
            const orderCount = orders.filter(order => order.shop === shopName).length;
            const isActive = activeShop === shopName;
            return (
              <Button
                key={shopName}
                type="button"
                role="tab"
                aria-selected={isActive}
                variant="ghost"
                size="sm"
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
              </Button>
            );
          })}
        </div>
        <div className="orders-filters">
          <SearchInput className="orders-filters__search" label="Tìm đơn hàng" placeholder="Mã đơn, ghi chú..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <FormField label="Từ ngày"><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></FormField>
          <FormField label="Đến ngày"><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></FormField>
          <FormField label="Trạng thái đối soát">
            <select value={reconFilter} onChange={e => setReconFilter(e.target.value)}>
              <option value="all">Tất cả</option>
              <option value="unreconciled">Chưa có Doanh Thu Thực Tế</option>
              <option value="reconciled">Đã đối soát</option>
            </select>
          </FormField>
          <FormField label="Lợi nhuận gộp">
            <select value={profitFilter} onChange={e => setProfitFilter(e.target.value)}>
              <option value="all">Tất cả</option>
              <option value="negative">Chỉ đơn bị âm</option>
            </select>
          </FormField>
          <FormField label="Trạng thái giao hàng">
            <select value={deliveryFilter} onChange={e => setDeliveryFilter(e.target.value)}>
              <option value="all">Tất cả</option>
              <option value="returned">Đơn bị hoàn</option>
              <option value="delivered">Đơn đã giao</option>
            </select>
          </FormField>
          <FormField label="Sắp xếp theo ngày">
            <select value={dateSort} onChange={e => setDateSort(e.target.value)}>
              <option value="newest">Ngày mới nhất</option>
              <option value="oldest">Ngày cũ nhất</option>
            </select>
          </FormField>
        </div>

        <div className="orders-result-count" aria-live="polite">
          Shop <strong>{activeShop || 'Chưa cấu hình'}</strong>: đang hiển thị <strong>{filteredOrders.length}</strong> / {shopOrders.length} đơn
        </div>

        <div className="table-container orders-table-container">
          <table>
            <thead>
              <tr>
                <th className="orders-expand-cell"><span className="ui-visually-hidden">Mở chi tiết</span></th>
                <th>Mã Đơn</th>
                <th>Kênh Bán</th>
                <th>Ngày Đặt</th>
                <th>Tổng Giá Bán</th>
                <th>Phí Đóng gói</th>
                <th>Phí Hoàn</th>
                <th>Thực Tế (Nhận)</th>
                <th>Ngày Nhận</th>
                <th>Tổng Lợi Nhuận Gộp</th>
                <th className="orders-actions-cell">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={11}><EmptyState title="Không tìm thấy đơn hàng" description="Hãy thử thay đổi bộ lọc hoặc từ khóa tìm kiếm." /></td>
                </tr>
              )}
              {filteredOrders.map(o => {
                const totalRevenue = o.items.reduce((sum, item) => sum + (item.isReturned ? 0 : (item.qty * item.sellingPrice)), 0);
                const profit = calculateOrderGrossProfit(o);
                const isExpanded = expandedOrderId === o.id;

                return (
                  <React.Fragment key={o.id}>
                    <tr className={`orders-row${o.hasError ? ' has-error' : ''}${isExpanded ? ' is-expanded' : ''}`} onClick={() => setExpandedOrderId(isExpanded ? null : o.id)}>
                      <td>
                        <span className="orders-expand-indicator" aria-hidden="true">{isExpanded ? '▼' : '▶'}</span>
                      </td>
                      <td className="orders-value-strong">
                        {o.id}
                        {o.hasError && <Badge variant="danger" className="orders-error-badge">Lỗi Mã SP</Badge>}
                      </td>
                      <td>{o.shop}</td>
                      <td>{o.date}</td>
                      <td className="num orders-value-strong">{totalRevenue.toLocaleString()} đ</td>
                      <td>
                        <input 
                          type="number"
                          defaultValue={o.packagingFee ?? defaultPackagingCost}
                          onBlur={(e) => handleInlineFeeUpdate(o, 'packagingFee', e.target.value)}
                          className="orders-inline-fee num"
                          disabled={updatingFeeKey === `${o.id}-packagingFee`}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td>
                        <input 
                          type="number"
                          defaultValue={o.returnFee || 0}
                          onBlur={(e) => handleInlineFeeUpdate(o, 'returnFee', e.target.value)}
                          className="orders-inline-fee num"
                          disabled={updatingFeeKey === `${o.id}-returnFee`}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="num orders-value-primary">
                        {o.actualRevenue !== null && o.actualRevenue !== undefined ? o.actualRevenue.toLocaleString() + ' đ' : '-'}
                      </td>
                      <td className="orders-value-primary">
                        {o.settlementDate || '-'}
                      </td>
                      <td className={`num orders-value-strong ${profit > 0 ? 'orders-value-positive' : 'orders-value-negative'}`}>
                        {profit.toLocaleString()} đ
                      </td>
                      <td className="orders-actions-cell">
                        <div className="orders-row-actions">
                          {can('orders', 'update') && <Button variant="ghost" size="sm" icon={Edit} onClick={(e) => { e.stopPropagation(); handleEditOrder(o); }}>Sửa</Button>}
                          {can('orders', 'delete') && <Button variant="danger" size="sm" icon={Trash2} onClick={(e) => { e.stopPropagation(); handleDeleteOrder(o); }}>Xóa</Button>}
                        </div>
                      </td>
                    </tr>
                    
                    {isExpanded && (
                      <tr>
                        <td colSpan={11} className="orders-detail-cell">
                          <div className="orders-detail">
                            <div className="orders-detail__summary">
                              <div><span>Trạng thái giao:</span> <strong>{o.status}</strong></div>
                              <div><span>Phí đóng gói:</span> <strong className="num">{(o.packagingFee ?? defaultPackagingCost).toLocaleString()} đ</strong></div>
                              <div><span>Phí hoàn:</span> <strong className="num orders-value-negative">{(o.returnFee || 0).toLocaleString()} đ</strong></div>
                              <div><span>Tổng Giá Vốn (Gồm Đóng gói & Phí hoàn):</span> <strong className="num orders-value-negative">{(o.totalCost || 0).toLocaleString()} đ</strong></div>
                            </div>
                            {o.note && (
                              <div className="orders-detail__note">
                                <strong>Ghi chú:</strong> {o.note}
                              </div>
                            )}
                            
                            <table className="orders-detail__table">
                              <thead>
                                <tr>
                                  <th>Sản phẩm</th><th>SL</th><th>Giá Bán (1c)</th><th>Tổng Giá Bán</th><th>T.Thái Bán</th><th>Giá Vốn Đơn Vị (1c)</th><th>Tổng Vốn Dòng Này</th>
                                </tr>
                              </thead>
                              <tbody>
                                {o.items.map((item, idx) => {
                                  const prod = products.find(p => p.id === item.productId);
                                  const unitCost = item.qty > 0 && item.totalCostDeducted ? Math.round(item.totalCostDeducted / item.qty) : 0;
                                  return (
                                    <tr key={idx} className={item.isReturned ? 'is-returned' : ''}>
                                      <td>
                                        <div className="orders-product-cell">
                                          <ProductImage imageId={prod?.imageId} size={32} />
                                          <div>
                                            <div className="orders-product-name">{prod?.name || item.name || 'Sản phẩm không xác định'}</div>
                                            <div className="orders-product-code">{item.sku || prod?.sku || item.productId}</div>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="num">{item.qty}</td>
                                      <td className="num orders-value-primary">
                                        {(Number(item.sellingPrice) || 0).toLocaleString()} đ
                                      </td>
                                      <td className="num orders-value-primary">
                                        {item.isReturned ? '0 đ' : `${((Number(item.sellingPrice) || 0) * item.qty).toLocaleString()} đ`}
                                      </td>
                                      <td>
                                        {item.isReturned ? <Badge variant="danger">Hoàn trả</Badge> : <Badge variant="success">Đã bán</Badge>}
                                      </td>
                                      <td className="num">{item.isReturned ? '0 đ' : `${unitCost.toLocaleString()} đ`}</td>
                                      <td className="num orders-value-strong">{item.isReturned ? '0 đ' : `${(item.totalCostDeducted || 0).toLocaleString()} đ`}</td>
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
      </section>
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
