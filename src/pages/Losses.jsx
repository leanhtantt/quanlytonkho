import { useMemo, useState } from 'react';
import { useAppStore } from '../store/appStoreContext';
import { IconPencil as Pencil, IconPlus as Plus, IconDeviceFloppy as Save, IconTrash as Trash2, IconX as X, IconRefresh } from '@tabler/icons-react';
import ProductImage from '../components/ProductImage';
import { buildInventoryAdjustmentDisplayCodes } from '../domain/inventoryAdjustmentCodes';
import { findProductByCode, productMatchesSearch } from '../domain/productSku';
import { toast } from '../components/ui/toastHelper';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useAuth } from '../lib/AuthContext';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import FormField from '../components/ui/FormField';
import SearchInput from '../components/ui/SearchInput';

export default function Losses() {
  const { inventory, losses, addLoss, updateLoss, deleteLoss, refresh, refreshing } = useAppStore();
  const { can } = useAuth();
  const {
    inventoryAdjustments,
    addInventoryAdjustment,
    updateInventoryAdjustment,
    deleteInventoryAdjustment
  } = useAppStore();
  const [showForm, setShowForm] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('Hàng hỏng do vận chuyển');
  
  // State cho việc thêm nhiều SP
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [qty, setQty] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [editingLossId, setEditingLossId] = useState(null);
  const [deletingLossId, setDeletingLossId] = useState(null);
  const [pendingLossDelete, setPendingLossDelete] = useState(null);
  const [adjustmentType, setAdjustmentType] = useState('LOSS');
  const [unitCost, setUnitCost] = useState(0);
  const [editingAdjustmentId, setEditingAdjustmentId] = useState(null);
  const [deletingAdjustmentId, setDeletingAdjustmentId] = useState(null);
  const formResource = adjustmentType === 'SURPLUS' ? 'products' : 'losses';
  const formAction = editingLossId || editingAdjustmentId ? 'update' : 'create';
  const canModifyForm = can(formResource, formAction);
  const [pendingAdjustmentDelete, setPendingAdjustmentDelete] = useState(null);
  const [statsSearch, setStatsSearch] = useState('');

  const getLatestUnitCost = (product) => {
    const latestBatch = [...(product?.batches || [])]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .at(-1);
    return Number(latestBatch?.costVnd) || 0;
  };

  const getValidUnitCost = (item) => {
    const itemUnitCost = Number(item?.unitCost);
    return Number.isFinite(itemUnitCost) && itemUnitCost >= 0
      ? itemUnitCost
      : getLatestUnitCost(item?.product);
  };

  const handleAddItem = () => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('vi');
    const product = findProductByCode(inventory, searchQuery) || inventory.find(p => {
      const sku = String(p.sku || '').trim().toLocaleLowerCase('vi');
      const name = String(p.name || '').trim().toLocaleLowerCase('vi');
      return sku === normalizedQuery
        || name === normalizedQuery
        || `${sku} - ${name}` === normalizedQuery;
    });
    if (!product || qty <= 0) {
      toast.error('Vui lòng chọn đúng SKU hoặc tên sản phẩm và nhập số lượng > 0.');
      return;
    }
    let resolvedUnitCost = Number(unitCost) || 0;
    if (adjustmentType === 'SURPLUS') {
      resolvedUnitCost ||= getLatestUnitCost(product);
    }
    const nextItem = {
      product,
      qty: Number(qty),
      ...(adjustmentType === 'SURPLUS' ? { unitCost: resolvedUnitCost } : {})
    };
    setItems(prev => editingLossId || editingAdjustmentId
      ? [nextItem]
      : [...prev, nextItem]);
    setSearchQuery('');
    setQty(1);
    if (adjustmentType === 'SURPLUS') setUnitCost(0);
  };

  const handleRemoveItem = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveLoss = async () => {
    if (items.length === 0) return;

    setIsSaving(true);
    try {
      if (editingAdjustmentId) {
        const item = items[0];
        const resolvedUnitCost = getValidUnitCost(item);
        await updateInventoryAdjustment(editingAdjustmentId, {
          date,
          productId: item.product.id,
          qty: item.qty,
          unitCost: resolvedUnitCost,
          reason
        });
      } else if (adjustmentType === 'SURPLUS') {
        for (const item of items) {
          const resolvedUnitCost = getValidUnitCost(item);
          await addInventoryAdjustment({
            date,
            productId: item.product.id,
            qty: item.qty,
            unitCost: resolvedUnitCost,
            reason
          });
        }
      } else if (editingLossId) {
        const item = items[0];
        await updateLoss(editingLossId, {
          date,
          productId: item.product.id,
          sku: item.product.sku,
          name: item.product.name,
          qty: item.qty,
          reason
        });
      } else {
      for (const item of items) {
        await addLoss({
          date,
          productId: item.product.id,
          sku: item.product.sku,
          name: item.product.name,
          qty: item.qty,
          reason
        });
      }
      }

      const productNames = items.map(item => item.product.sku || item.product.id).join(', ');
      toast.success(editingLossId || editingAdjustmentId
        ? `Đã cập nhật phiếu điều chỉnh kho cho ${productNames}.`
        : `Đã lưu phiếu điều chỉnh kho cho ${productNames}.`);
      resetForm();
    } catch (error) {
      console.error('Lưu phiếu điều chỉnh kho thất bại', error);
      toast.error(`Không lưu được phiếu điều chỉnh kho: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingLossId(null);
    setEditingAdjustmentId(null);
    setAdjustmentType('LOSS');
    setUnitCost(0);
    setItems([]);
    setSearchQuery('');
    setQty(1);
    setReason('Kiểm kho hao hụt');
  };

  const handleEditLoss = (loss) => {
    if (!loss.id) {
      toast.error('Phiếu hao hụt này không có UUID hợp lệ. Hãy tải lại trang.');
      return;
    }
    const product = inventory.find(item => item.id === loss.productId);
    if (!product) {
      toast.error('Không tìm thấy sản phẩm của phiếu hao hụt này trong kho.');
      return;
    }

    setEditingLossId(loss.id);
    setDate(String(loss.date || '').slice(0, 10));
    setReason(loss.reason || '');
    setItems([{ product, qty: Number(loss.qty) }]);
    setSearchQuery('');
    setQty(Number(loss.qty));
    setShowForm(true);
  };

  const handleDeleteLoss = (loss) => {
    if (!loss.id) {
      toast.error('Phiếu hao hụt này không có UUID hợp lệ. Hãy tải lại trang.');
      return;
    }
    setPendingLossDelete(loss);
  };

  const confirmDeleteLoss = async () => {
    if (!pendingLossDelete) return;

    const displayCode = lossDisplayCodes.get(pendingLossDelete.id);
    setDeletingLossId(pendingLossDelete.id);
    try {
      await deleteLoss(pendingLossDelete.id);
      toast.success(`Đã xóa ${displayCode} và hoàn tác tồn kho/chi phí. Mã hiển thị còn lại sẽ được đánh lại theo thứ tự ngày.`);
      setPendingLossDelete(null);
    } catch (error) {
      console.error('Xóa phiếu hao hụt thất bại', error);
      toast.error(`Không xóa được phiếu hao hụt: ${error.message}`);
    } finally {
      setDeletingLossId(null);
    }
  };

  const handleEditAdjustment = (adjustment) => {
    const product = inventory.find(item => item.id === adjustment.productId);
    if (!product) {
      toast.error('Không tìm thấy sản phẩm của phiếu kiểm kê dư này trong kho.');
      return;
    }
    setAdjustmentType('SURPLUS');
    setEditingAdjustmentId(adjustment.id);
    setEditingLossId(null);
    setDate(String(adjustment.date || '').slice(0, 10));
    setReason(adjustment.reason || 'Kiểm kê dư');
    setUnitCost(Number(adjustment.unitCost) || 0);
    setItems([{ product, qty: Number(adjustment.qty), unitCost: Number(adjustment.unitCost) || 0 }]);
    setQty(Number(adjustment.qty));
    setShowForm(true);
  };

  const handleDeleteAdjustment = (adjustment) => {
    setPendingAdjustmentDelete(adjustment);
  };

  const confirmDeleteAdjustment = async () => {
    if (!pendingAdjustmentDelete) return;

    const displayCode = adjustmentDisplayCodes.get(pendingAdjustmentDelete.id);
    setDeletingAdjustmentId(pendingAdjustmentDelete.id);
    try {
      await deleteInventoryAdjustment(pendingAdjustmentDelete.id);
      toast.success(`Đã xóa ${displayCode}.`);
      setPendingAdjustmentDelete(null);
    } catch (error) {
      console.error('Xóa phiếu kiểm kê dư thất bại', error);
      toast.error(`Không xóa được phiếu kiểm kê dư: ${error.message}`);
    } finally {
      setDeletingAdjustmentId(null);
    }
  };

  // Sắp xếp sản phẩm theo SKU và tên; ID nội bộ không dùng cho tìm kiếm.
  const sortedInventory = [...inventory].sort((a, b) => {
    const skuComparison = String(a.sku || '').localeCompare(String(b.sku || ''), 'vi', { numeric: true, sensitivity: 'base' });
    return skuComparison || String(a.name || '').localeCompare(String(b.name || ''), 'vi', { sensitivity: 'base' });
  });

  const lossDisplayCodes = useMemo(() => {
    const chronologicalLosses = [...losses].sort((a, b) => {
      const dateComparison = String(a.date || '').localeCompare(String(b.date || ''));
      return dateComparison || String(a.id || '').localeCompare(String(b.id || ''));
    });

    return new Map(chronologicalLosses.map((loss, index) => [
      loss.id,
      `HHK${String(index + 1).padStart(4, '0')}`
    ]));
  }, [losses]);

  const adjustmentDisplayCodes = useMemo(
    () => buildInventoryAdjustmentDisplayCodes(inventoryAdjustments),
    [inventoryAdjustments]
  );

  const adjustmentStats = useMemo(() => {
    const statsByProduct = new Map();
    const getStats = (record) => {
      const product = inventory.find(item => item.id === record.productId);
      const current = statsByProduct.get(record.productId) || {
        productId: record.productId,
        sku: record.sku || product?.sku || record.productId,
        name: record.name || product?.name || 'Sản phẩm không xác định',
        increaseQty: 0,
        decreaseQty: 0,
        increaseValue: 0,
        decreaseValue: 0
      };
      statsByProduct.set(record.productId, current);
      return current;
    };

    losses.forEach(loss => {
      const stats = getStats(loss);
      stats.decreaseQty += Number(loss.qty) || 0;
      stats.decreaseValue += Number(loss.totalCostDeducted) || 0;
    });

    inventoryAdjustments.forEach(adjustment => {
      const stats = getStats(adjustment);
      stats.increaseQty += Number(adjustment.qty) || 0;
      stats.increaseValue += Number(adjustment.totalValue) || 0;
    });

    return [...statsByProduct.values()]
      .map(stats => ({ ...stats, netQty: stats.increaseQty - stats.decreaseQty }))
      .sort((a, b) => String(a.sku).localeCompare(String(b.sku), 'vi', { numeric: true, sensitivity: 'base' }));
  }, [inventory, inventoryAdjustments, losses]);

  const normalizedStatsSearch = statsSearch.trim().toLocaleLowerCase('vi');
  const filteredAdjustmentStats = useMemo(() => {
    if (!normalizedStatsSearch) return adjustmentStats;
    return adjustmentStats.filter(stats =>
      String(stats.sku).toLocaleLowerCase('vi').includes(normalizedStatsSearch)
      || String(stats.name).toLocaleLowerCase('vi').includes(normalizedStatsSearch)
    );
  }, [adjustmentStats, normalizedStatsSearch]);

  const matchesStatsSearch = (record) => {
    if (!normalizedStatsSearch) return true;
    const product = inventory.find(item => item.id === record.productId);
    if (product && productMatchesSearch(product, normalizedStatsSearch)) return true;
    const sku = String(record.sku || product?.sku || record.productId || '').toLocaleLowerCase('vi');
    const name = String(record.name || product?.name || '').toLocaleLowerCase('vi');
    return sku.includes(normalizedStatsSearch) || name.includes(normalizedStatsSearch);
  };

  const filteredLosses = losses.filter(matchesStatsSearch);
  const filteredInventoryAdjustments = inventoryAdjustments.filter(matchesStatsSearch);

  const getFifoEstimate = (productId, qtyToDeduct) => {
    const product = inventory.find(p => p.id === productId);
    if (!product) return 0;
    
    let remainingToDeduct = Number(qtyToDeduct);
    let totalCostDeducted = 0;
    
    for (const batch of product.batches) {
      if (remainingToDeduct <= 0) break;
      if (batch.qtyRemaining > 0) {
        const deducted = Math.min(batch.qtyRemaining, remainingToDeduct);
        remainingToDeduct -= deducted;
        totalCostDeducted += (deducted * batch.costVnd);
      }
    }
    
    if (remainingToDeduct > 0) {
      const lastCost = product.batches.length > 0 ? product.batches[product.batches.length-1].costVnd : 0;
      totalCostDeducted += (remainingToDeduct * lastCost);
    }
    
    return totalCostDeducted;
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Điều Chỉnh Kho"
        description="Ghi nhận hao hụt hoặc hàng kiểm kê dư mà không làm sai lịch sử nhập hàng"
        actions={!showForm ? (
          <div className="header-actions">
            <Button variant="secondary" icon={IconRefresh} loading={refreshing} onClick={() => refresh().catch(() => toast.error('Không thể làm mới dữ liệu'))}>Làm mới</Button>
            {(can('losses', 'create') || can('products', 'create')) && <Button icon={Plus} onClick={() => setShowForm(true)}>Ghi nhận điều chỉnh</Button>}
          </div>
        ) : null}
      />

      {showForm && (
        <div className="card animate-fade-in loss-form-card">
          <div className="loss-form-header">
            <h2 className="h2">{editingLossId || editingAdjustmentId ? 'Sửa Phiếu Điều Chỉnh' : 'Tạo Phiếu Điều Chỉnh Kho'}</h2>
            <Button variant="secondary" icon={X} onClick={resetForm}>Hủy</Button>
          </div>

          <div className="loss-form-grid">
            <FormField label="Loại điều chỉnh">
              <select
                value={adjustmentType}
                disabled={Boolean(editingLossId || editingAdjustmentId)}
                onChange={e => {
                  setAdjustmentType(e.target.value);
                  setItems([]);
                  setUnitCost(0);
                  setReason(e.target.value === 'SURPLUS' ? 'Kiểm kê dư' : 'Hàng hỏng do vận chuyển');
                }}
              >
                <option value="LOSS">Giảm kho – hao hụt</option>
                <option value="SURPLUS">Tăng kho – kiểm kê dư</option>
              </select>
            </FormField>
            <FormField label="Ngày ghi nhận">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </FormField>
            <FormField label="Lý do" className="loss-reason-field">
              <input type="text" value={reason} onChange={e => setReason(e.target.value)} />
            </FormField>
          </div>

          <div className="loss-item-panel">
            <div className="loss-item-controls">
              <FormField label="Tìm SKU hoặc tên sản phẩm" className="loss-product-field">
                <input 
                  type="text" 
                  list="loss-products" 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Gõ SKU hoặc tên sản phẩm..."
                />
              </FormField>
              <datalist id="loss-products">
                {sortedInventory.map(p => (
                  <option key={p.id} value={`${p.sku || ''} - ${p.name}`}>{`Tồn: ${p.stock}`}</option>
                ))}
              </datalist>
              <FormField label="SL" className="loss-quantity-field">
                <input
                  type="number"
                  min="1"
                  value={qty}
                  onChange={e => {
                    setQty(e.target.value);
                    if (editingLossId || editingAdjustmentId) {
                      setItems(prev => prev.map((item, index) => index === 0
                        ? { ...item, qty: Number(e.target.value) }
                        : item));
                    }
                  }}
                />
              </FormField>
              {adjustmentType === 'SURPLUS' && (
                <FormField label="Giá vốn điều chỉnh" className="loss-cost-field">
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={unitCost}
                    onChange={e => {
                      setUnitCost(e.target.value);
                      if (editingAdjustmentId) {
                        setItems(prev => prev.map((item, index) => index === 0
                          ? { ...item, unitCost: Number(e.target.value) }
                          : item));
                      }
                    }}
                  />
                </FormField>
              )}
              {canModifyForm && <Button variant="secondary" icon={Plus} onClick={handleAddItem}>
                {editingLossId || editingAdjustmentId ? 'Thay sản phẩm/SL' : 'Thêm'}
              </Button>}
            </div>

            {items.length > 0 && (
              <div className="table-responsive loss-item-table-wrap">
                <table className="loss-item-table">
                  <thead>
                    <tr>
                      <th className="loss-item-image-column"></th>
                      <th>Mã SP</th>
                      <th>Tên SP</th>
                      <th className="num">Số lượng</th>
                      {adjustmentType === 'SURPLUS' && <th className="num">Giá vốn</th>}
                      <th className="num">{adjustmentType === 'SURPLUS' ? 'Giá trị tăng kho' : 'Ước tính Thiệt hại (FIFO)'}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => {
                      const resolvedUnitCost = adjustmentType === 'SURPLUS' ? getValidUnitCost(item) : 0;
                      const estimatedLoss = adjustmentType === 'SURPLUS' ? item.qty * resolvedUnitCost : getFifoEstimate(item.product.id, item.qty);
                      return (
                        <tr key={`${item.product.id}-${index}`}>
                          <td>
                            <ProductImage imageId={item.product.imageId} size={32} />
                          </td>
                          <td className="loss-code">{item.product.sku || item.product.id}</td>
                          <td>{item.product.name}</td>
                          <td className="num">{item.qty}</td>
                          {adjustmentType === 'SURPLUS' && (
                            <td className="num">{resolvedUnitCost.toLocaleString()} đ</td>
                          )}
                          <td className="num loss-value-danger">
                            {estimatedLoss.toLocaleString()} đ
                          </td>
                          <td className="loss-action-cell">
                            {canModifyForm && <Button variant="danger-ghost" size="sm" icon={X} iconOnly aria-label={`Bỏ ${item.product.sku || item.product.id} khỏi phiếu`} onClick={() => handleRemoveItem(index)} />}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="loss-form-actions">
            {canModifyForm && <Button icon={Save} loading={isSaving} onClick={handleSaveLoss} disabled={items.length === 0}>
              {isSaving ? 'Đang lưu...' : editingLossId || editingAdjustmentId ? 'Lưu thay đổi' : 'Lưu Phiếu'}
            </Button>}
          </div>
        </div>
      )}

      <div className="card loss-data-card">
        <div className="loss-card-header">
          <h2 className="h2">Thống kê điều chỉnh theo sản phẩm</h2>
          <p className="loss-card-description">
            Tổng hợp tất cả phiếu tăng/giảm kho đã lập.
          </p>
          <div className="loss-stats-search">
            <SearchInput
              label="Tìm theo SKU hoặc tên sản phẩm"
              value={statsSearch}
              onChange={event => setStatsSearch(event.target.value)}
              placeholder="Nhập SKU hoặc tên sản phẩm..."
            />
            {normalizedStatsSearch && (
              <div className="loss-search-meta">
                Tìm thấy {filteredAdjustmentStats.length} sản phẩm, {filteredLosses.length} phiếu giảm và {filteredInventoryAdjustments.length} phiếu tăng
              </div>
            )}
          </div>
        </div>
        <div className="table-container loss-table-container">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Tên sản phẩm</th>
                <th className="num loss-heading-success">SL tăng</th>
                <th className="num loss-heading-danger">SL giảm</th>
                <th className="num">Chênh lệch</th>
                <th className="num loss-heading-success">Giá trị tăng</th>
                <th className="num loss-heading-danger">Giá trị giảm</th>
              </tr>
            </thead>
            <tbody>
              {adjustmentStats.length === 0 && (
                <tr>
                  <td colSpan={7} className="loss-empty-cell">
                    <EmptyState title="Chưa có dữ liệu điều chỉnh kho" description="Các phiếu tăng hoặc giảm kho sẽ xuất hiện tại đây." />
                  </td>
                </tr>
              )}
              {adjustmentStats.length > 0 && filteredAdjustmentStats.length === 0 && (
                <tr>
                  <td colSpan={7} className="loss-empty-cell">
                    <EmptyState title="Không tìm thấy sản phẩm phù hợp" description="Thử tìm bằng SKU hoặc tên sản phẩm khác." />
                  </td>
                </tr>
              )}
              {filteredAdjustmentStats.map(stats => (
                <tr key={stats.productId}>
                  <td className="loss-code">{stats.sku}</td>
                  <td>{stats.name}</td>
                  <td className="num loss-value-success">{stats.increaseQty > 0 ? `+${stats.increaseQty}` : '0'}</td>
                  <td className="num loss-value-danger">{stats.decreaseQty > 0 ? `-${stats.decreaseQty}` : '0'}</td>
                  <td className={`num loss-net-value ${stats.netQty > 0 ? 'is-positive' : stats.netQty < 0 ? 'is-negative' : ''}`.trim()}>
                    {stats.netQty > 0 ? '+' : ''}{stats.netQty}
                  </td>
                  <td className="num">{Math.round(stats.increaseValue).toLocaleString()} đ</td>
                  <td className="num">{Math.round(stats.decreaseValue).toLocaleString()} đ</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Danh sách hao hụt */}
      <div className="card loss-data-card">
        <div className="loss-card-header">
          <h2 className="h2">Giảm kho – Hao hụt{normalizedStatsSearch ? ` (${filteredLosses.length})` : ''}</h2>
        </div>
        <div className="table-container loss-table-container">
          <table>
            <thead>
              <tr>
                <th>Mã Phiếu</th>
                <th>Ngày</th>
                <th>Sản phẩm</th>
                <th className="num">Số lượng</th>
                <th>Lý do</th>
                <th className="num loss-heading-danger">Giá trị thiệt hại</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {losses.length === 0 && (
                <tr>
                  <td colSpan={7} className="loss-empty-cell">
                    <EmptyState title="Chưa có ghi nhận hao hụt" description="Phiếu giảm kho đã lưu sẽ xuất hiện tại đây." />
                  </td>
                </tr>
              )}
              {losses.length > 0 && filteredLosses.length === 0 && (
                <tr>
                  <td colSpan={7} className="loss-empty-cell">
                    <EmptyState title="Không tìm thấy phiếu giảm kho" description="Thử thay đổi từ khóa tìm kiếm." />
                  </td>
                </tr>
              )}
              {filteredLosses.map(l => (
                <tr key={l.id}>
                  <td className="loss-code">{lossDisplayCodes.get(l.id)}</td>
                  <td>{formatDateOnly(l.date)}</td>
                  <td><div className="loss-product-name">{l.name}</div><div className="loss-product-meta">{l.sku || l.productId}</div></td>
                  <td className="num">{l.qty}</td>
                  <td>{l.reason}</td>
                  <td className="num loss-value-danger">{l.totalCostDeducted?.toLocaleString() || 0} đ</td>
                  <td>
                    <div className="loss-row-actions">
                      {can('losses', 'update') && <Button variant="ghost" size="sm" icon={Pencil} iconOnly onClick={() => handleEditLoss(l)} aria-label={`Sửa ${lossDisplayCodes.get(l.id)}`} title="Sửa phiếu" />}
                      {can('losses', 'delete') && <Button variant="danger-ghost" size="sm" icon={Trash2} iconOnly onClick={() => handleDeleteLoss(l)} loading={deletingLossId === l.id} aria-label={`Xóa ${lossDisplayCodes.get(l.id)}`} title="Xóa phiếu" />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card loss-data-card">
        <div className="loss-card-header">
          <h2 className="h2">Tăng kho – Kiểm kê dư{normalizedStatsSearch ? ` (${filteredInventoryAdjustments.length})` : ''}</h2>
        </div>
        <div className="table-container loss-table-container">
          <table>
            <thead>
              <tr>
                <th>Mã Phiếu</th>
                <th>Ngày</th>
                <th>Sản phẩm</th>
                <th className="num">Số lượng</th>
                <th className="num">Giá vốn</th>
                <th>Lý do</th>
                <th className="num loss-heading-success">Giá trị tăng kho</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {inventoryAdjustments.length === 0 && (
                <tr>
                  <td colSpan={8} className="loss-empty-cell">
                    <EmptyState title="Chưa có ghi nhận kiểm kê dư" description="Phiếu tăng kho đã lưu sẽ xuất hiện tại đây." />
                  </td>
                </tr>
              )}
              {inventoryAdjustments.length > 0 && filteredInventoryAdjustments.length === 0 && (
                <tr>
                  <td colSpan={8} className="loss-empty-cell">
                    <EmptyState title="Không tìm thấy phiếu tăng kho" description="Thử thay đổi từ khóa tìm kiếm." />
                  </td>
                </tr>
              )}
              {filteredInventoryAdjustments.map(adjustment => (
                <tr key={adjustment.id}>
                  <td className="loss-code">{adjustmentDisplayCodes.get(adjustment.id)}</td>
                  <td>{formatDateOnly(adjustment.date)}</td>
                  <td><div className="loss-product-name">{adjustment.name}</div><div className="loss-product-meta">{adjustment.sku || adjustment.productId}</div></td>
                  <td className="num">{adjustment.qty}</td>
                  <td className="num">{Number(adjustment.unitCost).toLocaleString()} đ</td>
                  <td>{adjustment.reason}</td>
                  <td className="num loss-value-success">{Number(adjustment.totalValue).toLocaleString()} đ</td>
                  <td>
                    <div className="loss-row-actions">
                      {can('products', 'update') && <Button variant="ghost" size="sm" icon={Pencil} iconOnly onClick={() => handleEditAdjustment(adjustment)} aria-label={`Sửa ${adjustmentDisplayCodes.get(adjustment.id)}`} title="Sửa phiếu" />}
                      {can('products', 'delete') && <Button variant="danger-ghost" size="sm" icon={Trash2} iconOnly onClick={() => handleDeleteAdjustment(adjustment)} loading={deletingAdjustmentId === adjustment.id} aria-label={`Xóa ${adjustmentDisplayCodes.get(adjustment.id)}`} title="Xóa phiếu" />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(pendingLossDelete)}
        onClose={() => !deletingLossId && setPendingLossDelete(null)}
        onConfirm={confirmDeleteLoss}
        title="Xóa phiếu hao hụt"
        itemName={pendingLossDelete ? lossDisplayCodes.get(pendingLossDelete.id) : undefined}
        description={pendingLossDelete ? `Xóa ${lossDisplayCodes.get(pendingLossDelete.id)}? Tồn kho và chi phí FIFO của phiếu này sẽ được hoàn tác.` : undefined}
        loading={Boolean(deletingLossId)}
      />
      <ConfirmDialog
        open={Boolean(pendingAdjustmentDelete)}
        onClose={() => !deletingAdjustmentId && setPendingAdjustmentDelete(null)}
        onConfirm={confirmDeleteAdjustment}
        title="Xóa phiếu kiểm kê dư"
        itemName={pendingAdjustmentDelete ? adjustmentDisplayCodes.get(pendingAdjustmentDelete.id) : undefined}
        description={pendingAdjustmentDelete ? `Xóa ${adjustmentDisplayCodes.get(pendingAdjustmentDelete.id)}? Số lượng kiểm kê dư sẽ bị gỡ khỏi kho.` : undefined}
        loading={Boolean(deletingAdjustmentId)}
      />
    </div>
  );
}

function formatDateOnly(value) {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}
