import { useState } from 'react';
import { useAppStore } from '../store/appStoreContext';
import { ShieldAlert, Plus, Save, X } from 'lucide-react';

export default function Losses() {
  const { inventory, losses, addLoss } = useAppStore();
  const [showForm, setShowForm] = useState(false);

  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('Hàng hỏng do vận chuyển');

  const handleSaveLoss = () => {
    const product = inventory.find(p => p.id === selectedProductId);
    if (!product || qty <= 0) return;
    
    const newLoss = {
      id: `LOSS-${Date.now()}`,
      date,
      productId: product.id,
      name: product.name,
      qty: Number(qty),
      reason,
      // lossValue is calculated in StoreContext now!
    };
    
    addLoss(newLoss);
    setShowForm(false);
    setSelectedProductId('');
    setQty(1);
    setReason('Hàng hỏng do vận chuyển');
  };

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
                <label style={labelStyle}>Chọn Sản Phẩm</label>
                <select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)} style={inputStyle}>
                  <option value="">-- Chọn mã SP --</option>
                  {inventory.map(p => (
                    <option key={p.id} value={p.id}>{p.id} - {p.name} (Tồn: {p.stock})</option>
                  ))}
                </select>
              </div>
              <div style={{ width: '100px' }}>
                <label style={labelStyle}>SL</label>
                <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} style={inputStyle} />
              </div>
            </div>
            
            {selectedProductId && (
              <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--color-danger-light)', borderRadius: 'var(--radius-md)' }}>
                <p style={{ color: 'var(--color-danger)', fontWeight: 500 }}>
                  <ShieldAlert size={16} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '0.5rem' }}/>
                  Giá trị thiệt hại (Theo giá vốn FIFO): 
                  <span style={{ fontWeight: 700, marginLeft: '0.5rem' }}>
                    {getFifoEstimate(selectedProductId, qty).toLocaleString()} đ
                  </span>
                </p>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={handleSaveLoss} disabled={!selectedProductId}>
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
