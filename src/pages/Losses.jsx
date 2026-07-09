import { useState } from 'react';
import { useAppStore } from '../store/appStoreContext';
import { ShieldAlert, Plus, Save, X } from 'lucide-react';
import ProductImage from '../components/ProductImage';

export default function Losses() {
  const { inventory, losses, addLoss } = useAppStore();
  const [showForm, setShowForm] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('Hàng hỏng do vận chuyển');
  
  // State cho việc thêm nhiều SP
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [qty, setQty] = useState(1);

  const handleAddItem = () => {
    const product = inventory.find(p => p.id === searchQuery);
    if (!product || qty <= 0) {
      alert('Vui lòng chọn đúng mã sản phẩm và nhập số lượng > 0');
      return;
    }
    setItems(prev => [...prev, { product, qty: Number(qty) }]);
    setSearchQuery('');
    setQty(1);
  };

  const handleRemoveItem = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveLoss = () => {
    if (items.length === 0) return;
    
    // Tạo 1 ID chung cho phiếu này nếu cần gom nhóm, hoặc mỗi dòng 1 ID
    const batchId = `LOSS-${Date.now()}`;
    
    items.forEach((item, index) => {
      addLoss({
        id: `${batchId}-${index}`,
        date,
        productId: item.product.id,
        name: item.product.name,
        qty: item.qty,
        reason
      });
    });
    
    setShowForm(false);
    setItems([]);
    setSearchQuery('');
    setQty(1);
    setReason('Kiểm kho hao hụt');
  };

  // Sắp xếp sản phẩm theo chữ cái và số tự nhiên
  const sortedInventory = [...inventory].sort((a, b) => a.id.localeCompare(b.id, 'vi', { numeric: true, sensitivity: 'base' }));

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
          <h1 className="page-title">Hao Hụt Kho</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Ghi nhận mất/hỏng và tính thiệt hại theo giá vốn</p>
        </div>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={18} /> Ghi nhận hao hụt
          </button>
        )}
      </div>

      {showForm && (
        <div className="card animate-fade-in" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h3>Tạo Phiếu Xuất Hủy</h3>
            <button className="btn btn-outline" onClick={() => setShowForm(false)}><X size={16} /> Hủy</button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
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
                <label style={labelStyle}>Tìm Mã SP</label>
                <input 
                  type="text" 
                  list="loss-products" 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value.toUpperCase())} 
                  placeholder="Gõ mã SP để tìm kiếm..." 
                  style={inputStyle} 
                />
                <datalist id="loss-products">
                  {sortedInventory.map(p => (
                    <option key={p.id} value={p.id}>{p.id} - {p.name} (Tồn: {p.stock})</option>
                  ))}
                </datalist>
              </div>
              <div style={{ width: '100px' }}>
                <label style={labelStyle}>SL</label>
                <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} style={inputStyle} />
              </div>
              <button className="btn btn-outline" onClick={handleAddItem} style={{ height: '42px' }}>
                <Plus size={16} /> Thêm
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
                      <th style={{ textAlign: 'center', padding: '0.5rem' }}>SL Hao Hụt</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem' }}>Ước tính Thiệt hại (FIFO)</th>
                      <th style={{ padding: '0.5rem' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => {
                      const estimatedLoss = getFifoEstimate(item.product.id, item.qty);
                      return (
                        <tr key={index} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '0.5rem' }}>
                            <ProductImage imageId={item.product.imageId} size={32} />
                          </td>
                          <td style={{ padding: '0.5rem', fontWeight: 500 }}>{item.product.id}</td>
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
            <button className="btn btn-primary" onClick={handleSaveLoss} disabled={items.length === 0}>
              <Save size={18} /> Lưu Phiếu
            </button>
          </div>
        </div>
      )}

      {/* Danh sách hao hụt */}
      <div className="card" style={{ padding: 0 }}>
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
              </tr>
            </thead>
            <tbody>
              {losses.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                    Chưa có ghi nhận hao hụt nào.
                  </td>
                </tr>
              )}
              {losses.map(l => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 600 }}>{l.id}</td>
                  <td>{l.date}</td>
                  <td><div style={{ fontWeight: 500 }}>{l.name}</div><div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{l.productId}</div></td>
                  <td>{l.qty}</td>
                  <td>{l.reason}</td>
                  <td style={{ fontWeight: 600, color: 'var(--color-danger)' }}>{l.totalCostDeducted?.toLocaleString() || 0} đ</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
