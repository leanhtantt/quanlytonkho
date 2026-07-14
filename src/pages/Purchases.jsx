import React, { useState } from 'react';
import { useAppStore } from '../store/appStoreContext';
import { IconPackageImport, IconPlus as Plus, IconDeviceFloppy as Save, IconTrash as Trash2, IconEdit as Edit, IconX as X, IconRefresh } from '@tabler/icons-react';
import { findProductByCode, productMatchesSearch } from '../domain/productSku';
import { toast } from '../components/ui/toastHelper';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useAuth } from '../lib/AuthContext';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import FormField from '../components/ui/FormField';
import SearchInput from '../components/ui/SearchInput';

export default function Purchases() {
  const { purchases, addPurchase, updatePurchase, deletePurchase, products, refresh, refreshing } = useAppStore();
  const { can } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [expandedPurchaseId, setExpandedPurchaseId] = useState(null);
  const [editingPurchaseId, setEditingPurchaseId] = useState(null);
  const [isSavingPurchase, setIsSavingPurchase] = useState(false);
  const [pendingPurchaseDelete, setPendingPurchaseDelete] = useState(null);
  const [isDeletingPurchase, setIsDeletingPurchase] = useState(false);
  
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
  const [productSearch, setProductSearch] = useState('');

  const handleAddItem = () => {
    if (!newItem.id || !newItem.name || newItem.qty <= 0) return;
    setItems([...items, { 
      id: newItem.id.toUpperCase(),
      name: newItem.name,
      qty: Number(newItem.qty), 
      totalVndPrice: Number(newItem.totalVndPrice), 
      totalWeightKg: Number(newItem.totalWeightKg)
    }]);
    
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
      id: itemToEdit.id || '',
      name: itemToEdit.name || '',
      qty: itemToEdit.qty || 1,
      totalVndPrice: itemToEdit.totalVndPrice || 0,
      totalWeightKg: itemToEdit.totalWeightKg || 0
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

  const handleSavePurchase = async () => {
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
    
    setIsSavingPurchase(true);
    try {
      if (editingPurchaseId) {
        await updatePurchase(editingPurchaseId, { id: purchaseId || editingPurchaseId, ...purchaseData });
      } else {
        await addPurchase({ id: purchaseId || `PO-${Date.now()}`, ...purchaseData });
      }

      const savedPurchaseId = purchaseId || editingPurchaseId || purchaseData.orderName;
      toast.success(editingPurchaseId ? `Đã cập nhật phiếu nhập ${savedPurchaseId}.` : `Đã tạo phiếu nhập ${savedPurchaseId}.`);
      closeForm();
    } catch (error) {
      toast.error(`Không thể lưu phiếu nhập: ${error.message}`);
    } finally {
      setIsSavingPurchase(false);
    }
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

  const normalizedProductSearch = productSearch.trim().toLocaleLowerCase('vi');
  const filteredPurchases = purchases.filter(purchase => {
    if (!normalizedProductSearch) return true;

    return purchase.items.some(item => {
      const product = findProductByCode(products, item.productId);
      if (product && productMatchesSearch(product, normalizedProductSearch)) return true;
      const sku = String(product?.sku || item.sku || item.productId || '').toLocaleLowerCase('vi');
      const name = String(product?.name || item.name || '').toLocaleLowerCase('vi');
      return sku.includes(normalizedProductSearch) || name.includes(normalizedProductSearch);
    });
  });

  const handleDeletePurchase = (purchase) => {
    setPendingPurchaseDelete(purchase);
  };

  const confirmDeletePurchase = async () => {
    if (!pendingPurchaseDelete) return;

    setIsDeletingPurchase(true);
    try {
      await deletePurchase(pendingPurchaseDelete.id);
      toast.success(`Đã xóa phiếu nhập ${pendingPurchaseDelete.id}.`);
      setPendingPurchaseDelete(null);
    } catch (error) {
      toast.error(`Không xóa được phiếu nhập: ${error.message}`);
    } finally {
      setIsDeletingPurchase(false);
    }
  };

  const handleEditPurchase = (p) => {
    setEditingPurchaseId(p.id);
    setPurchaseId(p.id || '');
    setOrderName(p.orderName || p.supplier || '');
    setDate(p.date || new Date().toISOString().split('T')[0]);
    setNotes(p.notes || '');
    setPurchasingFee(p.purchasingFee || 0);
    setDomesticShipping(p.domesticShipping || 0);
    setDiscountVnd(p.discountVnd || 0);
    setCompensationVnd(p.compensationVnd || 0);
    setTotalIntlShipping(p.totalIntlShipping || 0);
    
    // Reconstruct items with total values since store saves unit values
    setItems(p.items.map(item => {
      const prod = findProductByCode(products, item.productId);
      return {
        id: prod?.sku || item.sku || item.productId || '',
        name: prod?.name || item.name || 'Sản phẩm không xác định',
        qty: item.qty || 1,
        totalVndPrice: item.totalVndPrice || 0,
        totalWeightKg: (item.weightKg * item.qty) || 0
      };
    }));
    
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Nhập Hàng"
        description="Quản lý lô hàng nhập, tự động chia cước và giảm giá"
        actions={!showForm ? (
          <div className="header-actions">
            <Button variant="secondary" icon={IconRefresh} loading={refreshing} onClick={() => refresh().catch(() => toast.error('Không thể làm mới dữ liệu'))}>Làm mới</Button>
            {can('purchases', 'create') && <Button icon={Plus} onClick={() => setShowForm(true)}>Nhập Lô Mới</Button>}
          </div>
        ) : null}
      />

      {showForm && (
        <section className="card animate-fade-in purchase-form" aria-labelledby="purchase-form-title">
          <div className="purchase-form__header">
            <h2 id="purchase-form-title" className="h3">{editingPurchaseId ? `Sửa Phiếu Nhập: ${editingPurchaseId}` : 'Tạo Lô Nhập Hàng Mới'}</h2>
            <div className="purchase-form__actions">
            {can('purchases', editingPurchaseId ? 'update' : 'create') && <Button icon={Save} loading={isSavingPurchase} onClick={handleSavePurchase} disabled={items.length === 0}>
                {isSavingPurchase ? 'Đang lưu...' : 'Lưu Phiếu Nhập'}
              </Button>}
              <Button variant="secondary" icon={X} onClick={closeForm}>Hủy</Button>
            </div>
          </div>
          
          <div className="purchase-form-grid">
            <FormField label="Mã Lô Hàng / Mã Tracking"><input type="text" placeholder="Để trống sẽ tự tạo" value={purchaseId} onChange={e => setPurchaseId(e.target.value)} /></FormField>
            <FormField label="Tên/Ghi chú đơn hàng"><input type="text" placeholder="Ví dụ: Đơn nhập túi xách tháng 10" value={orderName} onChange={e => setOrderName(e.target.value)} /></FormField>
            <FormField label="Ngày nhập"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></FormField>
            <FormField label="Ghi chú thêm (Nếu có)" className="purchase-form-grid__wide"><input type="text" placeholder="Báo mất hàng, sai mẫu..." value={notes} onChange={e => setNotes(e.target.value)} /></FormField>
          </div>

          <div className="purchase-fee-grid">
            <FormField label="Phí mua hàng (VNĐ)"><input className="num" type="number" step="1000" value={purchasingFee} onChange={e => setPurchasingFee(Number(e.target.value))} /></FormField>
            <FormField label="Phí ship nội địa TQ (VNĐ)"><input className="num" type="number" step="1000" value={domesticShipping} onChange={e => setDomesticShipping(Number(e.target.value))} /></FormField>
            <FormField label="Giảm giá tổng (VNĐ)"><input className="num" type="number" step="1000" value={discountVnd} onChange={e => setDiscountVnd(Number(e.target.value))} /></FormField>
            <FormField label="Shop bồi thường (VNĐ)" className="purchase-field--primary"><input className="num" type="number" step="1000" value={compensationVnd} onChange={e => setCompensationVnd(Number(e.target.value))} /></FormField>
            <FormField label="Tổng Cước VC về VN (VNĐ)"><input className="num" type="number" step="1000" value={totalIntlShipping} onChange={e => setTotalIntlShipping(Number(e.target.value))} /></FormField>
          </div>

          <div className="purchase-item-editor">
            <h3 className="h4 purchase-item-editor__title">Thêm Sản Phẩm (Nhập Tổng VNĐ)</h3>
            <div className="purchase-item-grid">
              <FormField label="Mã SP">
                <input 
                  type="text" 
                  placeholder="VD: SP01" 
                  value={newItem.id} 
                  onChange={e => {
                    const newId = e.target.value.toUpperCase();
                    const existingProd = findProductByCode(products, newId);
                    setNewItem({...newItem, id: newId, name: existingProd ? existingProd.name : newItem.name});
                  }} 
                />
              </FormField>
              <FormField label="Tên SP" className="purchase-item-grid__name"><input type="text" placeholder="Tên sản phẩm" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} /></FormField>
              <FormField label="Tổng SL"><input className="num" type="number" value={newItem.qty} onChange={e => setNewItem({...newItem, qty: e.target.value})} /></FormField>
              <FormField label="Tổng Tiền Mua (VNĐ)"><input className="num" type="number" step="1000" value={newItem.totalVndPrice} onChange={e => setNewItem({...newItem, totalVndPrice: e.target.value})} /></FormField>
              <FormField label="Tổng Cân Nặng (Kg)"><input className="num" type="number" step="0.01" value={newItem.totalWeightKg} onChange={e => setNewItem({...newItem, totalWeightKg: e.target.value})} /></FormField>
              {can('purchases', editingPurchaseId ? 'update' : 'create') && <Button className="purchase-item-grid__add" variant="secondary" icon={Plus} onClick={handleAddItem}>Thêm</Button>}
            </div>
          </div>

          {items.length > 0 && (
            <div className="table-container purchase-items-table">
              <table>
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th>SL</th>
                    <th>Tổng Tiền</th>
                    <th>Tổng Cân Nặng</th>
                    <th className="purchase-heading--primary num">Giá Vốn Đơn Vị (VNĐ/1 cái)</th>
                    <th className="purchase-actions-column">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    return (
                      <tr key={idx}>
                        <td>
                          <div className="purchase-product-cell">
                            <div className="purchase-product-cell__name">{item.name}</div>
                            <div className="purchase-product-cell__sku">{item.id}</div>
                          </div>
                        </td>
                        <td className="num">{item.qty}</td>
                        <td className="num">{Math.round(item.totalVndPrice).toLocaleString()} đ</td>
                        <td className="num">{item.totalWeightKg} kg</td>
                        <td className="num purchase-value--primary purchase-value--strong">
                          {Math.round(calculateCost(item)).toLocaleString()} đ
                        </td>
                        <td><div className="purchase-row-actions">
                          {can('purchases', editingPurchaseId ? 'update' : 'create') && <Button variant="ghost" size="sm" icon={Edit} iconOnly aria-label={`Sửa sản phẩm ${item.id}`} onClick={() => handleEditItem(idx)} />}
                          {can('purchases', editingPurchaseId ? 'update' : 'create') && <Button variant="danger-ghost" size="sm" icon={Trash2} iconOnly aria-label={`Xóa sản phẩm ${item.id} khỏi phiếu`} onClick={() => handleRemoveItem(idx)} />}
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </section>
      )}

      {/* Danh sách lô hàng đã nhập */}
      <section className="card purchase-history" aria-labelledby="purchase-history-title">
        <div className="purchase-history__header">
          <h2 id="purchase-history-title" className="h3">Lịch sử nhập hàng</h2>
          <SearchInput
            label="Tìm đơn theo SKU hoặc tên sản phẩm"
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            placeholder="Nhập SKU hoặc tên sản phẩm để xem đã nhập ở đơn nào..."
          />
          {normalizedProductSearch && (
            <div className="purchase-search-result">
              Tìm thấy {filteredPurchases.length} đơn nhập phù hợp
            </div>
          )}
        </div>
        <div className="table-container purchase-history__table">
          <table>
            <thead>
              <tr>
                <th className="purchase-expand-column"></th>
                <th>Mã Lô</th>
                <th>Tên Đơn Hàng</th>
                <th>Ngày Nhập</th>
                <th>Tổng SP</th>
                <th>Tổng Tiền Nhập (VNĐ)</th>
                <th className="purchase-history-actions-column">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {purchases.length === 0 && (
                <tr>
                  <td colSpan={7} className="purchase-empty-cell"><EmptyState icon={IconPackageImport} title="Chưa có lô hàng nào" description="Nhập lô mới để bắt đầu theo dõi tồn kho FIFO." /></td>
                </tr>
              )}
              {purchases.length > 0 && filteredPurchases.length === 0 && (
                <tr>
                  <td colSpan={7} className="purchase-empty-cell"><EmptyState icon={IconPackageImport} title="Không tìm thấy đơn nhập phù hợp" description="Thử tìm bằng SKU hoặc tên sản phẩm khác." /></td>
                </tr>
              )}
              {[...filteredPurchases].sort((a, b) => {
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
                    <tr className={`purchase-history-row ${isExpanded ? 'is-expanded' : ''}`} onClick={() => setExpandedPurchaseId(isExpanded ? null : p.id)}>
                      <td>
                        <span className="purchase-expand-indicator">{isExpanded ? '▼' : '▶'}</span>
                      </td>
                      <td className="purchase-id-cell">{p.id}</td>
                      <td className="purchase-value--primary">{p.orderName}</td>
                      <td>{p.date}</td>
                      <td className="num">{totalQty}</td>
                      <td className="num purchase-value--income purchase-value--strong">{totalVnd.toLocaleString()} đ</td>
                      <td>
                        <div className="purchase-row-actions">
                          {can('purchases', 'update') && <Button variant="ghost" size="sm" icon={Edit} iconOnly aria-label={`Sửa phiếu nhập ${p.id}`} onClick={(e) => { e.stopPropagation(); handleEditPurchase(p); }} />}
                          {can('purchases', 'delete') && <Button variant="danger-ghost" size="sm" icon={Trash2} iconOnly aria-label={`Xóa phiếu nhập ${p.id}`} onClick={(e) => { e.stopPropagation(); handleDeletePurchase(p); }} />}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="purchase-detail-cell">
                          <div className="purchase-detail">
                            <div className="purchase-detail__header">
                              <h3 className="h4">
                                Chi tiết mã hàng đã nhập trong đơn này
                              </h3>
                              {p.notes && <div className="purchase-detail__note">Ghi chú: {p.notes}</div>}
                            </div>
                            <table className="purchase-detail-table">
                              <thead>
                                <tr>
                                  <th>Sản phẩm</th>
                                  <th className="num">SL</th>
                                  <th className="num">Tiền Nhập Gốc (Tổng)</th>
                                  <th className="num">Cân nặng (1c)</th>
                                  <th className="num">Giá Vốn Cuối (1c)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.items.map((item, idx) => {
                                  const prod = products.find(p => p.id === item.productId);
                                  return (
                                    <tr key={idx}>
                                      <td>
                                        <div className="purchase-product-cell">
                                          <div className="purchase-product-cell__name">{prod?.name || item.name || 'Sản phẩm không xác định'}</div>
                                          <div className="purchase-product-cell__sku">{prod?.sku || item.productId}</div>
                                        </div>
                                      </td>
                                      <td className="num">{item.qty}</td>
                                      <td className="num">{item.totalVndPrice ? Math.round(item.totalVndPrice).toLocaleString() + ' đ' : '-'}</td>
                                      <td className="num">{item.weightKg > 0 ? (item.weightKg * item.qty).toFixed(2) : '-'} kg</td>
                                      <td className="num purchase-value--primary purchase-value--strong">{Math.round(item.finalCostVnd).toLocaleString()} đ</td>
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
        open={Boolean(pendingPurchaseDelete)}
        onClose={() => !isDeletingPurchase && setPendingPurchaseDelete(null)}
        onConfirm={confirmDeletePurchase}
        title="Xóa phiếu nhập"
        itemName={pendingPurchaseDelete?.id}
        description={pendingPurchaseDelete ? `Xóa phiếu nhập “${pendingPurchaseDelete.id}”? Toàn bộ lô hàng của phiếu này sẽ bị gỡ khỏi kho.` : undefined}
        loading={isDeletingPurchase}
      />
    </div>
  );
}
