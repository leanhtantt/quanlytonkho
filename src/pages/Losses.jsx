import { useMemo, useState } from 'react';
import { useAppStore } from '../store/appStoreContext';
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import ProductImage from '../components/ProductImage';

export default function Losses() {
  const { inventory, losses, addLoss, updateLoss, deleteLoss } = useAppStore();
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
  const [adjustmentType, setAdjustmentType] = useState('LOSS');
  const [unitCost, setUnitCost] = useState(0);
  const [editingAdjustmentId, setEditingAdjustmentId] = useState(null);
  const [deletingAdjustmentId, setDeletingAdjustmentId] = useState(null);

  const handleAddItem = () => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('vi');
    const product = inventory.find(p => {
      const sku = String(p.sku || '').trim().toLocaleLowerCase('vi');
      const name = String(p.name || '').trim().toLocaleLowerCase('vi');
      return sku === normalizedQuery
        || name === normalizedQuery
        || `${sku} - ${name}` === normalizedQuery;
    });
    if (!product || qty <= 0) {
      alert('Vui lòng chọn đúng SKU hoặc tên sản phẩm và nhập số lượng > 0');
      return;
    }
    setItems(prev => editingLossId || adjustmentType === 'SURPLUS'
      ? [{ product, qty: Number(qty) }]
      : [...prev, { product, qty: Number(qty) }]);
    if (adjustmentType === 'SURPLUS') {
      const latestBatch = [...product.batches].sort((a, b) => new Date(a.date) - new Date(b.date)).at(-1);
      setUnitCost(Number(latestBatch?.costVnd) || 0);
    }
    setSearchQuery('');
    setQty(1);
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
        await updateInventoryAdjustment(editingAdjustmentId, {
          date,
          productId: item.product.id,
          qty: item.qty,
          unitCost: Number(unitCost),
          reason
        });
      } else if (adjustmentType === 'SURPLUS') {
        const item = items[0];
        await addInventoryAdjustment({
          date,
          productId: item.product.id,
          qty: item.qty,
          unitCost: Number(unitCost),
          reason
        });
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

      resetForm();
    } catch (error) {
      console.error('Lưu phiếu hao hụt thất bại', error);
      alert(`Không lưu được phiếu hao hụt: ${error.message}`);
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
      alert('Phiếu hao hụt này không có UUID hợp lệ. Hãy tải lại trang.');
      return;
    }
    const product = inventory.find(item => item.id === loss.productId);
    if (!product) {
      alert('Không tìm thấy sản phẩm của phiếu hao hụt này trong kho.');
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

  const handleDeleteLoss = async (loss) => {
    if (!loss.id) {
      alert('Phiếu hao hụt này không có UUID hợp lệ. Hãy tải lại trang.');
      return;
    }
    const displayCode = lossDisplayCodes.get(loss.id);
    if (!window.confirm(`Xóa ${displayCode}? Tồn kho và chi phí FIFO của phiếu này sẽ được hoàn tác.`)) return;

    setDeletingLossId(loss.id);
    try {
      await deleteLoss(loss.id);
      alert(`Đã xóa ${displayCode} và hoàn tác tồn kho/chi phí. Mã hiển thị còn lại sẽ được đánh lại theo thứ tự ngày.`);
    } catch (error) {
      console.error('Xóa phiếu hao hụt thất bại', error);
      alert(`Không xóa được phiếu hao hụt: ${error.message}`);
    } finally {
      setDeletingLossId(null);
    }
  };

  const handleEditAdjustment = (adjustment) => {
    const product = inventory.find(item => item.id === adjustment.productId);
    if (!product) {
      alert('Không tìm thấy sản phẩm của phiếu kiểm kê dư này trong kho.');
      return;
    }
    setAdjustmentType('SURPLUS');
    setEditingAdjustmentId(adjustment.id);
    setEditingLossId(null);
    setDate(String(adjustment.date || '').slice(0, 10));
    setReason(adjustment.reason || 'Kiểm kê dư');
    setUnitCost(Number(adjustment.unitCost) || 0);
    setItems([{ product, qty: Number(adjustment.qty) }]);
    setQty(Number(adjustment.qty));
    setShowForm(true);
  };

  const handleDeleteAdjustment = async (adjustment) => {
    const displayCode = adjustmentDisplayCodes.get(adjustment.id);
    if (!window.confirm(`Xóa ${displayCode}? Số lượng kiểm kê dư sẽ bị gỡ khỏi kho.`)) return;
    setDeletingAdjustmentId(adjustment.id);
    try {
      await deleteInventoryAdjustment(adjustment.id);
    } catch (error) {
      console.error('Xóa phiếu kiểm kê dư thất bại', error);
      alert(`Không xóa được phiếu kiểm kê dư: ${error.message}`);
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

  const adjustmentDisplayCodes = useMemo(() => new Map(
    [...inventoryAdjustments]
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.id).localeCompare(String(b.id)))
      .map((adjustment, index) => [adjustment.id, `KKD${String(index + 1).padStart(4, '0')}`])
  ), [inventoryAdjustments]);

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
      <div className="page-header">
        <div>
          <h1 className="page-title">Điều Chỉnh Kho</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Ghi nhận hao hụt hoặc hàng kiểm kê dư mà không làm sai lịch sử nhập hàng</p>
        </div>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={18} /> Ghi nhận điều chỉnh
          </button>
        )}
      </div>

      {showForm && (
        <div className="card animate-fade-in" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h3>{editingLossId || editingAdjustmentId ? 'Sửa Phiếu Điều Chỉnh' : 'Tạo Phiếu Điều Chỉnh Kho'}</h3>
            <button className="btn btn-outline" onClick={resetForm}><X size={16} /> Hủy</button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={labelStyle}>Loại điều chỉnh</label>
              <select
                value={adjustmentType}
                disabled={Boolean(editingLossId || editingAdjustmentId)}
                onChange={e => {
                  setAdjustmentType(e.target.value);
                  setItems([]);
                  setUnitCost(0);
                  setReason(e.target.value === 'SURPLUS' ? 'Kiểm kê dư' : 'Hàng hỏng do vận chuyển');
                }}
                style={inputStyle}
              >
                <option value="LOSS">Giảm kho – hao hụt</option>
                <option value="SURPLUS">Tăng kho – kiểm kê dư</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Ngày ghi nhận</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={labelStyle}>Lý do</label>
              <input type="text" value={reason} onChange={e => setReason(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ padding: '1.5rem', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 300px' }}>
                <label style={labelStyle}>Tìm SKU hoặc tên sản phẩm</label>
                <input 
                  type="text" 
                  list="loss-products" 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Gõ SKU hoặc tên sản phẩm..."
                  style={inputStyle} 
                />
                <datalist id="loss-products">
                  {sortedInventory.map(p => (
                    <option key={p.id} value={`${p.sku || ''} - ${p.name}`}>{`Tồn: ${p.stock}`}</option>
                  ))}
                </datalist>
              </div>
              <div style={{ width: '100px' }}>
                <label style={labelStyle}>SL</label>
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
                  style={inputStyle}
                />
              </div>
              {adjustmentType === 'SURPLUS' && (
                <div style={{ width: '170px' }}>
                  <label style={labelStyle}>Giá vốn điều chỉnh</label>
                  <input type="number" min="0" step="1000" value={unitCost} onChange={e => setUnitCost(e.target.value)} style={inputStyle} />
                </div>
              )}
              <button className="btn btn-outline" onClick={handleAddItem} style={{ height: '42px' }}>
                <Plus size={16} /> {editingLossId || editingAdjustmentId ? 'Thay sản phẩm/SL' : 'Thêm'}
              </button>
            </div>
            
            {items.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', backgroundColor: 'var(--color-bg-surface)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ width: '40px', padding: '0.5rem' }}></th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Mã SP</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Tên SP</th>
                      <th style={{ textAlign: 'center', padding: '0.5rem' }}>Số lượng</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem' }}>{adjustmentType === 'SURPLUS' ? 'Giá trị tăng kho' : 'Ước tính Thiệt hại (FIFO)'}</th>
                      <th style={{ padding: '0.5rem' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => {
                      const estimatedLoss = adjustmentType === 'SURPLUS' ? item.qty * Number(unitCost) : getFifoEstimate(item.product.id, item.qty);
                      return (
                        <tr key={`${item.product.id}-${index}`} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '0.5rem' }}>
                            <ProductImage imageId={item.product.imageId} size={32} />
                          </td>
                          <td style={{ padding: '0.5rem', fontWeight: 500 }}>{item.product.sku || item.product.id}</td>
                          <td style={{ padding: '0.5rem' }}>{item.product.name}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>{item.qty}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--color-danger)', fontWeight: 500 }}>
                            {estimatedLoss.toLocaleString()} đ
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                            <button onClick={() => handleRemoveItem(index)} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer' }}>
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={handleSaveLoss} disabled={items.length === 0 || isSaving}>
              <Save size={18} /> {isSaving ? 'Đang lưu...' : editingLossId || editingAdjustmentId ? 'Lưu thay đổi' : 'Lưu Phiếu'}
            </button>
          </div>
        </div>
      )}

      {/* Danh sách hao hụt */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ margin: 0 }}>Giảm kho – Hao hụt</h3>
        </div>
        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Mã Phiếu</th>
                <th>Ngày</th>
                <th>Sản phẩm</th>
                <th>Số lượng</th>
                <th>Lý do</th>
                <th style={{ color: 'var(--color-danger)' }}>Giá trị thiệt hại</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {losses.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                    Chưa có ghi nhận hao hụt nào.
                  </td>
                </tr>
              )}
              {losses.map(l => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 600 }}>{lossDisplayCodes.get(l.id)}</td>
                  <td>{formatDateOnly(l.date)}</td>
                  <td><div style={{ fontWeight: 500 }}>{l.name}</div><div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{l.sku || l.productId}</div></td>
                  <td>{l.qty}</td>
                  <td>{l.reason}</td>
                  <td style={{ fontWeight: 600, color: 'var(--color-danger)' }}>{l.totalCostDeducted?.toLocaleString() || 0} đ</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-outline" onClick={() => handleEditLoss(l)} aria-label={`Sửa ${lossDisplayCodes.get(l.id)}`} title="Sửa phiếu">
                        <Pencil size={15} />
                      </button>
                      <button className="btn btn-outline" onClick={() => handleDeleteLoss(l)} disabled={deletingLossId === l.id} aria-label={`Xóa ${lossDisplayCodes.get(l.id)}`} title="Xóa phiếu" style={{ color: 'var(--color-danger)' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 0, marginTop: '1.5rem' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ margin: 0 }}>Tăng kho – Kiểm kê dư</h3>
        </div>
        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Mã Phiếu</th>
                <th>Ngày</th>
                <th>Sản phẩm</th>
                <th>Số lượng</th>
                <th>Giá vốn</th>
                <th>Lý do</th>
                <th style={{ color: 'var(--color-success)' }}>Giá trị tăng kho</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {inventoryAdjustments.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                    Chưa có ghi nhận kiểm kê dư nào.
                  </td>
                </tr>
              )}
              {inventoryAdjustments.map(adjustment => (
                <tr key={adjustment.id}>
                  <td style={{ fontWeight: 600 }}>{adjustmentDisplayCodes.get(adjustment.id)}</td>
                  <td>{formatDateOnly(adjustment.date)}</td>
                  <td><div style={{ fontWeight: 500 }}>{adjustment.name}</div><div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{adjustment.sku || adjustment.productId}</div></td>
                  <td>{adjustment.qty}</td>
                  <td>{Number(adjustment.unitCost).toLocaleString()} đ</td>
                  <td>{adjustment.reason}</td>
                  <td style={{ fontWeight: 600, color: 'var(--color-success)' }}>{Number(adjustment.totalValue).toLocaleString()} đ</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-outline" onClick={() => handleEditAdjustment(adjustment)} aria-label={`Sửa ${adjustmentDisplayCodes.get(adjustment.id)}`} title="Sửa phiếu">
                        <Pencil size={15} />
                      </button>
                      <button className="btn btn-outline" onClick={() => handleDeleteAdjustment(adjustment)} disabled={deletingAdjustmentId === adjustment.id} aria-label={`Xóa ${adjustmentDisplayCodes.get(adjustment.id)}`} title="Xóa phiếu" style={{ color: 'var(--color-danger)' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function formatDateOnly(value) {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
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
