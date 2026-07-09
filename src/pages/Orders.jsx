import React, { useState, useRef } from 'react';
import { useAppStore } from '../store/appStoreContext';
import { Search, Plus, Save, X, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

const SHOPS = ['Chà Tiktok', 'Chà Shopee', 'Lyn WD', 'Lyn - Phụ kiện', 'Lyn Tiktok'];

export default function Orders() {
  const { products, orders, addOrder, updateOrder, defaultPackagingCost } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  
  // Filters
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reconFilter, setReconFilter] = useState('all'); // all | reconciled | unreconciled
  
  // Form State
  const [orderId, setOrderId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [shop, setShop] = useState(SHOPS[0]);
  const [status, setStatus] = useState('Đang giao'); // Vẫn giữ để filter nhưng Hoàn hàng dùng item.isReturned
  const [packagingFee, setPackagingFee] = useState(defaultPackagingCost);
  const [actualRevenue, setActualRevenue] = useState('');
  const [settlementDate, setSettlementDate] = useState('');
  const [items, setItems] = useState([]);
  
  // New Item State
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedProductName, setSelectedProductName] = useState('');
  const [qty, setQty] = useState(1);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [isReturned, setIsReturned] = useState(false);
  
  const [importShop, setImportShop] = useState(SHOPS[0]);
  
  const fileInputRef = useRef(null); // Cho Đối soát Doanh thu
  const importInputRef = useRef(null); // Cho Import Đơn Hàng mới

  const handleProductSelect = (id) => {
    setSelectedProductId(id.toUpperCase());
    const prod = products.find(p => p.id === id.toUpperCase());
    if (prod) {
      setSelectedProductName(prod.name);
    }
  };

  const handleAddItem = () => {
    if (!selectedProductId || !selectedProductName || qty <= 0) return;
    
    setItems([...items, { 
      productId: selectedProductId, 
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
    setSelectedProductId(item.productId);
    setSelectedProductName(item.name);
    setQty(item.qty);
    setSellingPrice(item.sellingPrice);
    setIsReturned(item.isReturned || false);
    handleRemoveItem(index);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingOrderId(null);
    setItems([]);
    setOrderId('');
    setDate(new Date().toISOString().split('T')[0]);
    setShop(SHOPS[0]);
    setStatus('Đang giao');
    setPackagingFee(defaultPackagingCost);
    setActualRevenue('');
    setSettlementDate('');
  };

  const handleSaveOrder = () => {
    if (items.length === 0 || !orderId) return;

    // Validate manual save: ensure all products exist in inventory
    const invalidItems = items.filter(item => !products.find(p => p.id === item.productId));
    if (invalidItems.length > 0) {
      alert(`Lỗi: Các mã SP sau không có trong kho: ${invalidItems.map(i => i.productId).join(', ')}. Vui lòng chọn lại mã đúng!`);
      return;
    }
    
    const orderData = {
      date,
      shop,
      status, 
      packagingFee: Number(packagingFee) || 0,
      actualRevenue: actualRevenue !== '' ? Number(actualRevenue) : null,
      settlementDate: settlementDate !== '' ? settlementDate : null,
      items,
      hasError: false // Đã sửa xong thì clear lỗi
    };
    
    if (editingOrderId) {
      updateOrder(editingOrderId, orderData);
    } else {
      addOrder({ id: orderId, ...orderData });
    }
    
    closeForm();
  };

  const handleEditOrder = (o) => {
    setEditingOrderId(o.id);
    setOrderId(o.id);
    setDate(o.date);
    setShop(o.shop);
    setStatus(o.status);
    setPackagingFee(o.packagingFee ?? defaultPackagingCost);
    setActualRevenue(o.actualRevenue !== null && o.actualRevenue !== undefined ? o.actualRevenue : '');
    setSettlementDate(o.settlementDate || '');
    setItems(o.items.map(i => ({ ...i }))); // deep copy
    
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        let updateCount = 0;
        data.forEach(row => {
          // Tìm cột mã đơn (case-insensitive keys)
          const keys = Object.keys(row);
          const idKey = keys.find(k => k.toLowerCase().includes('mã đơn') || k.toLowerCase().includes('order id') || k.toLowerCase() === 'id' || k.toLowerCase().includes('mã'));
          const revKey = keys.find(k => k.toLowerCase().includes('doanh thu') || k.toLowerCase().includes('thực tế') || k.toLowerCase().includes('thu về'));
          const dateKey = keys.find(k => k.toLowerCase().includes('ngày đối soát') || k.toLowerCase().includes('ngày thanh toán') || k.toLowerCase().includes('ngày hoàn thành'));
          
          if (idKey && revKey) {
            const rowId = row[idKey]?.toString().trim();
            const rowRev = Number(row[revKey]);
            const rowDate = dateKey && row[dateKey] ? row[dateKey].toString().trim() : undefined;
            
            let parsedDate = undefined;
            if (rowDate) {
              if (!isNaN(Number(rowDate))) {
                const jsDate = new Date(Math.round((rowDate - 25569) * 86400 * 1000));
                parsedDate = jsDate.toISOString().split('T')[0];
              } else if (rowDate.includes('/')) {
                const parts = rowDate.split(/[\s/:-]+/);
                if (parts.length >= 3) {
                  const day = parts[0].padStart(2, '0');
                  const month = parts[1].padStart(2, '0');
                  const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                  parsedDate = `${year}-${month}-${day}`;
                }
              } else {
                parsedDate = rowDate.substring(0, 10);
              }
            }

            if (rowId && !isNaN(rowRev)) {
              if (orders.find(o => o.id === rowId)) {
                updateOrder(rowId, { actualRevenue: rowRev, settlementDate: parsedDate });
                updateCount++;
              }
            }
          }
        });
        
        alert(`✅ Đã đối soát tự động và cập nhật doanh thu thực tế cho ${updateCount} đơn hàng!`);
      } catch (err) {
        console.error(err);
        alert('❌ Có lỗi xảy ra khi đọc file Excel. Đảm bảo file có cột chứa "Mã Đơn" và "Doanh Thu".');
      }
      e.target.value = null; // reset file input
    };
    reader.readAsBinaryString(file);
  };

  const handleExcelImportOrders = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
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
            const k = keys.find(key => keywords.some(kw => key.toLowerCase().includes(kw)));
            return k ? row[k] : undefined;
          };
          
          const rowId = getVal(['mã đơn hàng', 'mã đơn', 'order id']);
          if (!rowId) return; 
          
          const idStr = rowId.toString().trim();
          
          // Bỏ qua nếu đơn hàng đã tồn tại
          if (orders.find(o => o.id === idStr)) {
            return;
          }
          
          const statusText = getVal(['trạng thái đơn hàng', 'trạng thái', 'status']) || '';
          if (statusText.toLowerCase().includes('hủy')) return; // Bỏ qua đơn huỷ
          
          let mappedStatus = 'Đang giao';
          if (statusText.toLowerCase().includes('đã giao') || statusText.toLowerCase().includes('hoàn thành')) mappedStatus = 'Đã giao';
          if (statusText.toLowerCase().includes('trả hàng') || statusText.toLowerCase().includes('hoàn tiền')) mappedStatus = 'Hoàn hàng';
          
          const dateRaw = getVal(['ngày đặt hàng', 'ngày đặt', 'thời gian']) || new Date().toISOString();
          const dateStr = dateRaw.toString().split(' ')[0]; // Lấy phần YYYY-MM-DD
          
          const sku = getVal(['sku phân loại hàng', 'sku sản phẩm', 'mã sku', 'mã sp']) || '';
          const name = getVal(['tên sản phẩm', 'sản phẩm']) || 'Sản phẩm không tên';
          const qty = Number(getVal(['số lượng', 'qty'])) || 1;
          
          // Cố gắng tìm cột Giá ưu đãi / Giá bán
          const price = Number(getVal(['giá ưu đãi', 'giá bán', 'giá gốc'])) || 0;
          
          if (!orderMap[idStr]) {
            orderMap[idStr] = {
              id: idStr,
              date: dateStr,
              shop: importShop, // Gán Kênh Bán theo lựa chọn trên giao diện
              status: mappedStatus,
              packagingFee: defaultPackagingCost, // Mặc định từ cấu hình
              items: [],
              hasError: false
            };
          }
          
          const productId = sku ? sku.toString().trim().toUpperCase() : '';
          
          orderMap[idStr].items.push({
            productId: productId,
            name: name,
            qty: qty,
            sellingPrice: price,
            isReturned: mappedStatus === 'Hoàn hàng'
          });
          
          // Đánh dấu lỗi nếu SKU rỗng hoặc SKU không tồn tại trong kho
          if (!productId || !products.find(p => p.id === productId)) {
            orderMap[idStr].hasError = true;
          }
        });
        
        let newOrderCount = 0;
        let errorOrderCount = 0;
        
        Object.values(orderMap).forEach(orderData => {
          if (orderData.items.length > 0) {
            if (orderData.hasError) errorOrderCount++;
            addOrder(orderData);
            newOrderCount++;
          }
        });
        
        alert(`✅ Đã nhập ${newOrderCount} đơn hàng mới. (Trong đó có ${errorOrderCount} đơn bị lỗi mã SP, vui lòng tìm các dòng màu đỏ để Sửa lại).`);
      } catch (err) {
        console.error(err);
        alert('❌ Có lỗi xảy ra khi đọc file Excel. Đảm bảo đây là file xuất chuẩn từ sàn.');
      }
      e.target.value = null;
    };
    reader.readAsBinaryString(file);
  };

  const filteredOrders = orders.filter(o => {
    const matchSearch = o.id.toLowerCase().includes(search.toLowerCase()) || o.shop.toLowerCase().includes(search.toLowerCase());
    let matchDate = true;
    if (startDate) matchDate = matchDate && o.date >= startDate;
    if (endDate) matchDate = matchDate && o.date <= endDate;
    let matchRecon = true;
    if (reconFilter === 'reconciled') matchRecon = o.actualRevenue !== null && o.actualRevenue !== undefined;
    if (reconFilter === 'unreconciled') matchRecon = o.actualRevenue === null || o.actualRevenue === undefined;
    
    return matchSearch && matchDate && matchRecon;
  });

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Xuất Bán (Đơn hàng)</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Quản lý đơn, hoàn hàng 1 phần và đối soát tự động qua Excel</p>
        </div>
        {!showForm && (
          <div className="header-actions">
            <input type="file" accept=".xlsx, .xls, .csv" style={{ display: 'none' }} ref={fileInputRef} onChange={handleExcelUpload} />
            <input type="file" accept=".xlsx, .xls, .csv" style={{ display: 'none' }} ref={importInputRef} onChange={handleExcelImportOrders} />
            
            <div className="import-control">
              <select value={importShop} onChange={e => setImportShop(e.target.value)}>
                {SHOPS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="btn btn-outline" style={{ border: 'none', borderColor: 'transparent', color: 'var(--color-primary)' }} onClick={() => importInputRef.current.click()}>
                <Upload size={18} /> Import Đơn Mới
              </button>
            </div>

            <button className="btn btn-outline" style={{ borderColor: 'var(--color-success)', color: 'var(--color-success)' }} onClick={() => fileInputRef.current.click()}>
              <Upload size={18} /> Đối Soát (Excel)
            </button>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={18} /> Nhập Đơn Tay
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <div className="card animate-fade-in" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h3>{editingOrderId ? `Sửa Đơn Hàng: ${editingOrderId}` : 'Tạo Đơn Hàng Mới'}</h3>
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
                {SHOPS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Trạng thái (Cả đơn)</label>
              <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
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
              <label style={{...labelStyle, color: 'var(--color-primary)'}}>Ngày nhận tiền</label>
              <input type="date" value={settlementDate} onChange={e => setSettlementDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{...labelStyle, color: 'var(--color-primary)'}}>Doanh thu Thực tế (VNĐ)</label>
              <input type="number" step="1000" placeholder="Chưa đối soát..." value={actualRevenue} onChange={e => setActualRevenue(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ padding: '1.5rem', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
            <h4 style={{ marginBottom: '1rem' }}>Thêm Sản Phẩm</h4>
            <datalist id="products-list">
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
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
                    <th>Giá Bán</th>
                    <th>Doanh thu</th>
                    <th>Trạng thái</th>
                    <th style={{ textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} style={{ opacity: item.isReturned ? 0.6 : 1 }}>
                      <td><div style={{ fontWeight: 600 }}>{item.name}</div><div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{item.productId}</div></td>
                      <td>{item.qty}</td>
                      <td>{item.sellingPrice.toLocaleString()} đ</td>
                      <td style={{ fontWeight: 700 }}>
                        {(item.qty * item.sellingPrice).toLocaleString()} đ
                      </td>
                      <td>
                        {item.isReturned ? <span className="badge badge-danger">Đã hoàn trả</span> : <span className="badge badge-success">Đã bán</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', marginRight: '0.5rem' }} onClick={() => handleEditItem(idx)}>Sửa</button>
                        <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }} onClick={() => handleRemoveItem(idx)}>Xoá</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={handleSaveOrder} disabled={items.length === 0 || !orderId}>
              <Save size={18} /> Lưu Đơn Hàng
            </button>
          </div>
        </div>
      )}

      {/* Danh sách đơn hàng */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ flex: '1 1 250px', position: 'relative' }}>
            <label style={labelStyle}>Tìm kiếm</label>
            <Search size={18} style={{ position: 'absolute', left: '1rem', bottom: '12px', color: 'var(--color-text-muted)' }} />
            <input type="text" placeholder="Mã đơn, shop..." value={search} onChange={(e) => setSearch(e.target.value)} style={{...inputStyle, paddingLeft: '2.5rem'}} />
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
        </div>

        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th>Mã Đơn</th>
                <th>Kênh Bán</th>
                <th>Ngày Đặt</th>
                <th>Doanh Thu Dự Kiến</th>
                <th style={{ color: 'var(--color-primary)' }}>Phí Đóng gói</th>
                <th style={{ color: 'var(--color-primary)' }}>Thực Tế (Nhận)</th>
                <th style={{ color: 'var(--color-primary)' }}>Ngày Nhận</th>
                <th>Tổng Lợi Nhuận Gộp</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                    Không tìm thấy đơn hàng nào phù hợp bộ lọc.
                  </td>
                </tr>
              )}
              {filteredOrders.map(o => {
                const totalRevenue = o.items.reduce((sum, item) => sum + (item.isReturned ? 0 : (item.qty * item.sellingPrice)), 0);
                const totalCost = o.totalCost || 0;
                const profit = (o.actualRevenue !== null && o.actualRevenue !== undefined ? o.actualRevenue : totalRevenue) - totalCost;
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
                          style={{ ...inputStyle, padding: '0.25rem 0.5rem', width: '80px', height: '30px' }}
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
                        <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={(e) => { e.stopPropagation(); handleEditOrder(o); }}>
                          Sửa
                        </button>
                      </td>
                    </tr>
                    
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} style={{ padding: 0, backgroundColor: 'var(--color-bg-base)' }}>
                          <div style={{ padding: '1rem 3rem', borderLeft: '4px solid var(--color-primary)' }}>
                            <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem' }}>
                              <div style={{ fontSize: '0.875rem' }}><span style={{ color: 'var(--color-text-muted)' }}>Trạng thái giao:</span> <span style={{ fontWeight: 600 }}>{o.status}</span></div>
                              <div style={{ fontSize: '0.875rem' }}><span style={{ color: 'var(--color-text-muted)' }}>Chi phí đóng gói:</span> <span style={{ fontWeight: 600 }}>{(o.packagingFee || 0).toLocaleString()} đ</span></div>
                              <div style={{ fontSize: '0.875rem' }}><span style={{ color: 'var(--color-text-muted)' }}>Tổng Giá Vốn (Đã gồm Đóng gói):</span> <span style={{ fontWeight: 600, color: 'var(--color-danger)' }}>{(o.totalCost || 0).toLocaleString()} đ</span></div>
                            </div>
                            
                            <table style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                              <thead>
                                <tr>
                                  <th style={{ background: 'transparent', padding: '0.5rem 1rem' }}>Sản phẩm</th>
                                  <th style={{ background: 'transparent', padding: '0.5rem 1rem' }}>SL</th>
                                  <th style={{ background: 'transparent', padding: '0.5rem 1rem' }}>T.Thái Bán</th>
                                  <th style={{ background: 'transparent', padding: '0.5rem 1rem' }}>Giá Vốn Đơn Vị (1c)</th>
                                  <th style={{ background: 'transparent', padding: '0.5rem 1rem' }}>Tổng Vốn Dòng Này</th>
                                </tr>
                              </thead>
                              <tbody>
                                {o.items.map((item, idx) => {
                                  const unitCost = item.qty > 0 && item.totalCostDeducted ? Math.round(item.totalCostDeducted / item.qty) : 0;
                                  return (
                                    <tr key={idx} style={{ opacity: item.isReturned ? 0.5 : 1 }}>
                                      <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
                                        <div style={{ fontWeight: 500 }}>{item.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{item.productId}</div>
                                      </td>
                                      <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)' }}>{item.qty}</td>
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
