import React, { useState } from 'react';
import { useAppStore } from '../store/appStoreContext';
import { Plus, Save, X } from 'lucide-react';

export default function Purchases() {
  const { purchases, addPurchase, updatePurchase, deletePurchase, addProduct, products } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [expandedPurchaseId, setExpandedPurchaseId] = useState(null);
  const [editingPurchaseId, setEditingPurchaseId] = useState(null);
  
  // Form State
  const [purchaseId, setPurchaseId] = useState('');
  const [orderName, setOrderName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [purchasingFee, setPurchasingFee] = useState(0); // VND
  const [domesticShipping, setDomesticShipping] = useState(0); // VND
  const [discountVnd, setDiscountVnd] = useState(0); // VND (Giảm giá tổng đơn)
  const [compensationVnd, setCompensationVnd] = useState(0); // VND (Bồi thường)
  const [totalIntlShipping, setTotalIntlShipping] = useState(0); // Tổng Cước VC (VND)
  
  const [items, setItems] = useState([]);
  
  // New Item State
  const [newItem, setNewItem] = useState({ id: '', name: '', qty: 1, totalVndPrice: 0, totalWeightKg: 0 });

  const handleAddItem = () => {
    if (!newItem.id || !newItem.name || newItem.qty <= 0) return;
    setItems([...items, { 
      id: newItem.id.toUpperCase(),
      name: newItem.name,
      qty: Number(newItem.qty), 
      totalVndPrice: Number(newItem.totalVndPrice), 
      totalWeightKg: Number(newItem.totalWeightKg)
    }]);
    
    addProduct({ id: newItem.id.toUpperCase(), name: newItem.name });
    setNewItem({ id: '', name: '', qty: 1, totalVndPrice: 0, totalWeightKg: 0 });
  };



  const handleRemoveItem = (index) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const handleEditItem = (index) => {
    const itemToEdit = items[index];
    setNewItem({
      id: itemToEdit.id,
      name: itemToEdit.name,
      qty: itemToEdit.qty,
      totalVndPrice: itemToEdit.totalVndPrice,
      totalWeightKg: itemToEdit.totalWeightKg
    });
    handleRemoveItem(index);
  };

  const calculateCost = (item) => {
    const totalLoteVndValue = items.reduce((sum, i) => sum + i.totalVndPrice, 0);
    const totalLoteWeight = items.reduce((sum, i) => sum + i.totalWeightKg, 0);

    const itemValueRatio = totalLoteVndValue > 0 ? (item.totalVndPrice / totalLoteVndValue) : 0;
    const itemWeightRatio = totalLoteWeight > 0 ? (item.totalWeightKg / totalLoteWeight) : 0;
    
    const itemVndDiscount = discountVnd * itemValueRatio;
    const itemCompensation = compensationVnd * itemValueRatio;
    const itemPurchasingFee = purchasingFee * itemValueRatio;
    const itemDomesticShipping = domesticShipping * (itemWeightRatio > 0 ? itemWeightRatio : itemValueRatio);
    
    const vndBase = item.totalVndPrice - itemVndDiscount - itemCompensation + itemPurchasingFee + itemDomesticShipping;
    
    const vndIntlShipping = totalIntlShipping * (itemWeightRatio > 0 ? itemWeightRatio : itemValueRatio);
    
    const totalVndCost = vndBase + vndIntlShipping;
    
    // Đơn giá Vốn 1 SP
    return Math.round(totalVndCost / item.qty);
  };

  const handleSavePurchase = () => {
    if (items.length === 0) return;
    
    const purchaseData = {
      orderName: orderName || 'Đơn nhập hàng',
      date: date,
      notes,
      purchasingFee,
      domesticShipping,
      discountVnd,
      compensationVnd,
      totalIntlShipping,
      items: items.map(item => ({
        productId: item.id.toUpperCase(),
        name: item.name,
        qty: item.qty,
        totalVndPrice: item.totalVndPrice, // Lưu lại tổng gốc
        weightKg: Number((item.totalWeightKg / item.qty).toFixed(3)), // Cân nặng đơn vị
        finalCostVnd: calculateCost(item)
      }))
    };
    
    if (editingPurchaseId) {
      updatePurchase(editingPurchaseId, purchaseData);
    } else {
      addPurchase({ id: purchaseId || `PO-${Date.now()}`, ...purchaseData });
    }
    
    closeForm();
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingPurchaseId(null);
    setItems([]);
    setPurchaseId('');
    setOrderName('');
    setDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setPurchasingFee(0);
    setDomesticShipping(0);
    setDiscountVnd(0);
    setCompensationVnd(0);
    setTotalIntlShipping(0);
  };

  const handleDeletePurchase = async (p) => {
    if (!window.confirm(`Bạn có chắc muốn xóa phiếu nhập "${p.id}"? Toàn bộ lô hàng của phiếu này sẽ bị gỡ khỏi kho.`)) return;
    try {
      await deletePurchase(p.id);
    } catch (err) {
      alert(`Không xóa được phiếu nhập: ${err.message}`);
    }
  };

  const handleEditPurchase = (p) => {
    setEditingPurchaseId(p.id);
    setPurchaseId(p.id);
    setOrderName(p.orderName);
    setDate(p.date);
    setNotes(p.notes || '');
    setPurchasingFee(p.purchasingFee || 0);
    setDomesticShipping(p.domesticShipping || 0);
    setDiscountVnd(p.discountVnd || 0);
    setCompensationVnd(p.compensationVnd || 0);
    setTotalIntlShipping(p.totalIntlShipping || 0);
    
    // Reconstruct items with total values since store saves unit values
    setItems(p.items.map(item => {
      const prod = products.find(prod => prod.id === item.productId || prod.sku === item.productId);
      return {
        id: prod?.sku || item.sku || item.productId,
        name: prod?.name || item.name || 'Sản phẩm không xác định',
        qty: item.qty,
        totalVndPrice: item.totalVndPrice || 0,
        totalWeightKg: item.weightKg * item.qty
      };
    }));
    
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Nhập Hàng</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Quản lý lô hàng nhập, tự động chia cước và giảm giá</p>
        </div>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={18} /> Nhập Lô Mới
          </button>
        )}
      </div>

      {showForm && (
        <div className="card animate-fade-in" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3>{editingPurchaseId ? `Sửa Phiếu Nhập: ${editingPurchaseId}` : 'Tạo Lô Nhập Hàng Mới'}</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={handleSavePurchase} disabled={items.length === 0}>
                <Save size={18} /> Lưu Phiếu Nhập
              </button>
              <button className="btn btn-outline" onClick={closeForm}><X size={16} /> Hủy</button>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>Mã Lô Hàng / Mã Tracking</label>
              <input type="text" placeholder="Để trống sẽ tự tạo" className="form-input" value={purchaseId} onChange={e => setPurchaseId(e.target.value)} disabled={!!editingPurchaseId} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Tên/Ghi chú đơn hàng</label>
              <input type="text" placeholder="Ví dụ: Đơn nhập túi xách tháng 10" className="form-input" value={orderName} onChange={e => setOrderName(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Ngày nhập</label>
              <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Ghi chú thêm (Nếu có)</label>
              <input type="text" placeholder="Báo mất hàng, sai mẫu..." className="form-input" value={notes} onChange={e => setNotes(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div>
              <label style={labelStyle}>Phí mua hàng (VNĐ)</label>
              <input type="number" step="1000" className="form-input" value={purchasingFee} onChange={e => setPurchasingFee(Number(e.target.value))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phí ship nội địa TQ (VNĐ)</label>
              <input type="number" step="1000" className="form-input" value={domesticShipping} onChange={e => setDomesticShipping(Number(e.target.value))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Giảm giá tổng (VNĐ)</label>
              <input type="number" step="1000" className="form-input" value={discountVnd} onChange={e => setDiscountVnd(Number(e.target.value))} style={inputStyle} />
            </div>
            <div>
              <label style={{...labelStyle, color: 'var(--color-primary)'}}>Shop bồi thường (VNĐ)</label>
              <input type="number" step="1000" className="form-input" value={compensationVnd} onChange={e => setCompensationVnd(Number(e.target.value))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Tổng Cước VC về VN (VNĐ)</label>
              <input type="number" step="1000" className="form-input" value={totalIntlShipping} onChange={e => setTotalIntlShipping(Number(e.target.value))} style={inputStyle} />
            </div>
          </div>

          <div style={{ padding: '1.5rem', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
            <h4 style={{ marginBottom: '1rem' }}>Thêm Sản Phẩm (Nhập Tổng VNĐ)</h4>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 120px' }}>
                <label style={labelStyle}>Mã SP</label>
                <input 
                  type="text" 
                  placeholder="VD: SP01" 
                  value={newItem.id} 
                  onChange={e => {
                    const newId = e.target.value.toUpperCase();
                    const existingProd = products.find(p => (p.sku || '').toUpperCase() === newId || p.id.toUpperCase() === newId);
                    setNewItem({...newItem, id: newId, name: existingProd ? existingProd.name : newItem.name});
                  }} 
                  style={inputStyle} 
                />
              </div>
              <div style={{ flex: '2 1 180px' }}>
                <label style={labelStyle}>Tên SP</label>
                <input type="text" placeholder="Tên sản phẩm" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} style={inputStyle} />
              </div>
              <div style={{ width: '80px' }}>
                <label style={labelStyle}>Tổng SL</label>
                <input type="number" value={newItem.qty} onChange={e => setNewItem({...newItem, qty: e.target.value})} style={inputStyle} />
              </div>
              <div style={{ width: '150px' }}>
                <label style={labelStyle}>Tổng Tiền Mua (VNĐ)</label>
                <input type="number" step="1000" value={newItem.totalVndPrice} onChange={e => setNewItem({...newItem, totalVndPrice: e.target.value})} style={inputStyle} />
              </div>
              <div style={{ width: '150px' }}>
                <label style={labelStyle}>Tổng Cân Nặng (Kg)</label>
                <input type="number" step="0.01" value={newItem.totalWeightKg} onChange={e => setNewItem({...newItem, totalWeightKg: e.target.value})} style={inputStyle} />
              </div>
              <button className="btn btn-outline" onClick={handleAddItem} style={{ height: '42px' }}><Plus size={16} /> Thêm</button>
            </div>
          </div>

          {items.length > 0 && (
            <div className="table-container" style={{ marginBottom: '1.5rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th>SL</th>
                    <th>Tổng Tiền</th>
                    <th>Tổng Cân Nặng</th>
                    <th style={{ color: 'var(--color-primary)' }}>Giá Vốn Đơn Vị (VNĐ/1 cái)</th>
                    <th style={{ width: '100px', textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    return (
                      <tr key={idx}>
                        <td>
                          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: 600 }}>{item.name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{item.id}</div>
                            </div>
                          </div>
                        </td>
                        <td>{item.qty}</td>
                        <td>{Math.round(item.totalVndPrice).toLocaleString()} đ</td>
                        <td>{item.totalWeightKg} kg</td>
                        <td style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                          {Math.round(calculateCost(item)).toLocaleString()} đ
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', marginRight: '0.5rem' }} onClick={() => handleEditItem(idx)}>Sửa</button>
                          <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }} onClick={() => handleRemoveItem(idx)}>Xoá</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}

      {/* Danh sách lô hàng đã nhập */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ margin: 0 }}>Lịch sử nhập hàng</h3>
        </div>
        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th>Mã Lô</th>
                <th>Tên Đơn Hàng</th>
                <th>Ngày Nhập</th>
                <th>Tổng SP</th>
                <th>Tổng Tiền Nhập (VNĐ)</th>
                <th style={{ width: '80px' }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {purchases.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                    Chưa có lô hàng nào. Hãy nhập lô mới!
                  </td>
                </tr>
              )}
              {[...purchases].sort((a, b) => {
                if (a.date !== b.date) return new Date(b.date) - new Date(a.date); // ngày mới nhất lên trên
                return String(b.id).localeCompare(String(a.id));
              }).map(p => {
                const totalVnd = Math.round(
                  p.items.reduce((sum, item) => sum + (item.totalVndPrice || 0), 0) 
                  - (p.discountVnd || 0) - (p.compensationVnd || 0) 
                  + (p.purchasingFee || 0) + (p.domesticShipping || 0) + (p.totalIntlShipping || 0)
                );
                const totalQty = p.items.reduce((sum, item) => sum + item.qty, 0);
                const isExpanded = expandedPurchaseId === p.id;

                return (
                  <React.Fragment key={p.id}>
                    <tr style={{ cursor: 'pointer', backgroundColor: isExpanded ? 'var(--color-bg-hover)' : '' }} onClick={() => setExpandedPurchaseId(isExpanded ? null : p.id)}>
                      <td>
                        {isExpanded ? <span style={{fontSize: '12px'}}>▼</span> : <span style={{fontSize: '12px'}}>▶</span>}
                      </td>
                      <td style={{ fontWeight: 600 }}>{p.id}</td>
                      <td style={{ fontWeight: 500, color: 'var(--color-primary)' }}>{p.orderName}</td>
                      <td>{p.date}</td>
                      <td>{totalQty}</td>
                      <td style={{ fontWeight: 600, color: 'var(--color-success)' }}>{totalVnd.toLocaleString()} đ</td>
                      <td>
                        <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', marginRight: '0.5rem' }} onClick={(e) => { e.stopPropagation(); handleEditPurchase(p); }}>
                          Sửa
                        </button>
                        <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }} onClick={(e) => { e.stopPropagation(); handleDeletePurchase(p); }}>
                          Xóa
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} style={{ padding: 0, backgroundColor: 'var(--color-bg-base)' }}>
                          <div style={{ padding: '1rem 3rem', borderLeft: '4px solid var(--color-primary)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <h5 style={{ marginBottom: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                                Chi tiết mã hàng đã nhập trong đơn này
                              </h5>
                              {p.notes && <div style={{ fontSize: '0.8rem', color: 'var(--color-warning)', fontWeight: 500 }}>Ghi chú: {p.notes}</div>}
                            </div>
                            <table style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                              <thead>
                                <tr>
                                  <th style={{ background: 'transparent', padding: '0.5rem 1rem' }}>Sản phẩm</th>
                                  <th style={{ background: 'transparent', padding: '0.5rem 1rem' }}>SL</th>
                                  <th style={{ background: 'transparent', padding: '0.5rem 1rem' }}>Tiền Nhập Gốc (Tổng)</th>
                                  <th style={{ background: 'transparent', padding: '0.5rem 1rem' }}>Cân nặng (1c)</th>
                                  <th style={{ background: 'transparent', padding: '0.5rem 1rem' }}>Giá Vốn Cuối (1c)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.items.map((item, idx) => {
                                  const prod = products.find(p => p.id === item.productId);
                                  return (
                                    <tr key={idx}>
                                      <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
                                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                          <div>
                                            <div style={{ fontWeight: 500 }}>{prod?.name || item.name || 'Sản phẩm không xác định'}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{prod?.sku || item.productId}</div>
                                          </div>
                                        </div>
                                      </td>
                                      <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)' }}>{item.qty}</td>
                                      <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)' }}>{item.totalVndPrice ? Math.round(item.totalVndPrice).toLocaleString() + ' đ' : '-'}</td>
                                      <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)' }}>{item.weightKg > 0 ? (item.weightKg * item.qty).toFixed(2) : '-'} kg</td>
                                      <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)', fontWeight: 600, color: 'var(--color-primary)' }}>{Math.round(item.finalCostVnd).toLocaleString()} đ</td>
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
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '0.75rem 1rem',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg-surface)',
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
