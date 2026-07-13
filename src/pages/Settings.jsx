import React, { useState } from 'react';
import { useAppStore } from '../store/appStoreContext';
import { Plus, Trash2, Save } from 'lucide-react';
import { deleteImage, getImage } from '../domain/imageDb';
import { deleteProductImage, isRemoteImage, uploadProductImage } from '../domain/imageStorage';

export default function Settings() {
  const { accounts, setAccounts, shops, setShops, partners, setPartners, products, updateProduct, defaultPackagingCost, setDefaultPackagingCost, defaultReturnFee, setDefaultReturnFee } = useAppStore();

  const [localAccounts, setLocalAccounts] = useState([...accounts]);
  const [localShops, setLocalShops] = useState([...shops]);
  const [localPartners, setLocalPartners] = useState(partners.map(p => ({...p})));
  const [localPkgCost, setLocalPkgCost] = useState(defaultPackagingCost);
  const [localReturnFee, setLocalReturnFee] = useState(defaultReturnFee);
  const [newAccount, setNewAccount] = useState('');
  const [newShop, setNewShop] = useState('');
  const [imageMigration, setImageMigration] = useState({ running: false, completed: 0, total: 0, failed: 0 });

  const legacyImageProducts = products.filter(product => product.imageId && !isRemoteImage(product.imageId));

  const handleMigrateImages = async () => {
    if (legacyImageProducts.length === 0) {
      alert('Tất cả ảnh sản phẩm đã nằm trên Firebase Storage.');
      return;
    }
    setImageMigration({ running: true, completed: 0, total: legacyImageProducts.length, failed: 0 });
    let completed = 0;
    let failed = 0;

    for (const product of legacyImageProducts) {
      let uploadedUrl = null;
      try {
        const dataUrl = product.imageId.startsWith('data:image/')
          ? product.imageId
          : await getImage(product.imageId);
        if (!dataUrl) throw new Error('Không tìm thấy dữ liệu ảnh cục bộ.');

        uploadedUrl = await uploadProductImage(product.id, dataUrl);
        await updateProduct(product.id, { imageId: uploadedUrl });
        if (!product.imageId.startsWith('data:image/')) await deleteImage(product.imageId);
        completed += 1;
      } catch (error) {
        if (uploadedUrl) await deleteProductImage(uploadedUrl).catch(() => {});
        failed += 1;
        console.error(`Không thể di chuyển ảnh ${product.sku || product.id}:`, error);
      }
      setImageMigration({ running: true, completed, total: legacyImageProducts.length, failed });
    }

    setImageMigration({ running: false, completed, total: legacyImageProducts.length, failed });
    alert(failed === 0
      ? `Đã chuyển thành công ${completed} ảnh lên Firebase Storage.`
      : `Đã chuyển ${completed} ảnh; ${failed} ảnh lỗi và vẫn được giữ nguyên.`);
  };

  const handleAddShop = () => {
    const name = newShop.trim();
    if (!name) return;
    if (localShops.some(shop => shop.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'))) {
      alert('Tên shop đã tồn tại.');
      return;
    }
    setLocalShops([...localShops, name]);
    setNewShop('');
  };

  const handleAddAccount = () => {
    if (newAccount.trim() && !localAccounts.includes(newAccount.trim())) {
      setLocalAccounts([...localAccounts, newAccount.trim()]);
      setNewAccount('');
    }
  };

  const handleRemoveAccount = (acc) => {
    setLocalAccounts(localAccounts.filter(a => a !== acc));
  };

  const handleAddPartner = () => {
    setLocalPartners([...localPartners, { name: 'Thành viên mới', share: 0 }]);
  };

  const handleUpdatePartner = (index, field, value) => {
    const newP = [...localPartners];
    if (field === 'share') {
      newP[index][field] = Number(value) || 0;
    } else {
      newP[index][field] = value;
    }
    setLocalPartners(newP);
  };

  const handleRemovePartner = (index) => {
    const newP = [...localPartners];
    newP.splice(index, 1);
    setLocalPartners(newP);
  };

  const handleSave = () => {
    if (localShops.length === 0) {
      alert('Cần giữ lại ít nhất một shop để tạo và import đơn hàng.');
      return;
    }
    const totalShare = localPartners.reduce((sum, p) => sum + p.share, 0);
    if (totalShare !== 100) {
      alert(`Tổng tỷ lệ chia lợi nhuận phải bằng 100%. Hiện tại đang là ${totalShare}%`);
      return;
    }
    // Prevent duplicate partner names or empty names
    const names = localPartners.map(p => p.name.trim()).filter(Boolean);
    if (new Set(names).size !== names.length || names.length !== localPartners.length) {
      alert('Tên thành viên không được để trống và không được trùng lặp.');
      return;
    }

    setAccounts(localAccounts);
    setShops(localShops);
    setPartners(localPartners);
    setDefaultPackagingCost(Number(localPkgCost) || 0);
    setDefaultReturnFee(Number(localReturnFee) || 0);
    alert('Đã lưu cấu hình thành công!');
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Cài Đặt Hệ Thống</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Quản lý shop, tài khoản và tỷ lệ chia lợi nhuận</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave}>
          <Save size={18} /> Lưu Thay Đổi
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
        
        {/* General Settings */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Cấu Hình Chung
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxWidth: '600px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Phí đóng gói mặc định / 1 Đơn
              </label>
              <input 
                type="number" 
                value={localPkgCost} 
                onChange={e => setLocalPkgCost(e.target.value)} 
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Phí hoàn đơn mặc định
              </label>
              <input 
                type="number" 
                value={localReturnFee} 
                onChange={e => setLocalReturnFee(e.target.value)} 
                style={inputStyle}
              />
            </div>
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
            Mức phí này sẽ được tự động áp dụng khi tạo mới hoặc tải file Excel lên (Phí hoàn chỉ áp dụng cho đơn Hoàn). Bạn có thể ghi đè cho từng đơn cụ thể ở trang Xuất Bán.
          </p>
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Lưu Trữ Ảnh Sản Phẩm</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Ảnh mới được lưu trên Firebase Storage. Công cụ này chuyển ảnh cũ ra khỏi database/trình duyệt mà không làm thay đổi sản phẩm hoặc tồn kho.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={handleMigrateImages} disabled={imageMigration.running || legacyImageProducts.length === 0}>
              {imageMigration.running ? 'Đang chuyển ảnh...' : `Chuyển ${legacyImageProducts.length} ảnh cũ lên Storage`}
            </button>
            <span style={{ color: legacyImageProducts.length === 0 ? 'var(--color-success)' : 'var(--color-text-muted)', fontWeight: 600 }}>
              {imageMigration.running
                ? `${imageMigration.completed}/${imageMigration.total} hoàn tất${imageMigration.failed ? `, ${imageMigration.failed} lỗi` : ''}`
                : legacyImageProducts.length === 0 ? 'Tất cả ảnh đã được lưu an toàn trên Storage' : `${legacyImageProducts.length} ảnh đang chờ chuyển`}
            </span>
          </div>
        </div>

        {/* Shops Management */}
        <div className="card">
          <h3 style={{ marginBottom: '0.5rem' }}>Danh Sách Shop</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Shop mới sẽ xuất hiện khi nhập đơn tay, import Excel và nhập chi phí quảng cáo. Xóa khỏi danh sách không làm mất đơn hàng cũ.
          </p>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
            <input
              type="text"
              value={newShop}
              onChange={e => setNewShop(e.target.value)}
              placeholder="Nhập tên shop mới..."
              style={inputStyle}
              onKeyDown={e => e.key === 'Enter' && handleAddShop()}
            />
            <button className="btn btn-outline" onClick={handleAddShop}><Plus size={18} /> Thêm</button>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {localShops.map(shop => (
              <li key={shop} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', marginBottom: '0.5rem', backgroundColor: 'var(--color-bg-surface)' }}>
                <span style={{ fontWeight: 500 }}>{shop}</span>
                <button className="btn" aria-label={`Xóa shop ${shop}`} style={{ padding: '4px', color: 'var(--color-danger)' }} onClick={() => setLocalShops(localShops.filter(item => item !== shop))}>
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
            {localShops.length === 0 && <li style={{ color: 'var(--color-text-muted)' }}>Chưa có shop nào.</li>}
          </ul>
        </div>

        {/* Accounts Management */}
        <div className="card">
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Danh Sách Tài Khoản/Quỹ
          </h3>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
            <input 
              type="text" 
              value={newAccount} 
              onChange={e => setNewAccount(e.target.value)} 
              placeholder="Nhập tên tài khoản (VD: Momo, Tiền mặt)..." 
              style={inputStyle}
              onKeyDown={e => e.key === 'Enter' && handleAddAccount()}
            />
            <button className="btn btn-outline" onClick={handleAddAccount}><Plus size={18} /> Thêm</button>
          </div>
          
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {localAccounts.map((acc, idx) => (
              <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', marginBottom: '0.5rem', backgroundColor: 'var(--color-bg-surface)' }}>
                <span style={{ fontWeight: 500 }}>{acc}</span>
                <button className="btn" style={{ padding: '4px', color: 'var(--color-danger)' }} onClick={() => handleRemoveAccount(acc)}>
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
            {localAccounts.length === 0 && <div style={{ color: 'var(--color-text-muted)' }}>Chưa có tài khoản nào.</div>}
          </ul>
        </div>

        {/* Partners Management */}
        <div className="card">
          <h3 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Cổ Đông & Tỷ Lệ Lợi Nhuận
          </h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Tổng tỷ lệ chia phải bằng đúng 100%. Nếu có Quỹ Shop để tái đầu tư, hãy giữ 1 dòng cho Quỹ Shop.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
            {localPartners.map((p, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <input type="text" value={p.name} onChange={e => handleUpdatePartner(idx, 'name', e.target.value)} style={inputStyle} placeholder="Tên thành viên" />
                </div>
                <div style={{ width: '100px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="number" min="0" max="100" value={p.share} onChange={e => handleUpdatePartner(idx, 'share', e.target.value)} style={{...inputStyle, textAlign: 'right'}} />
                  <span>%</span>
                </div>
                <button className="btn" style={{ padding: '4px', color: 'var(--color-danger)' }} onClick={() => handleRemovePartner(idx)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          
          <button className="btn btn-outline" style={{ width: '100%' }} onClick={handleAddPartner}>
            <Plus size={18} /> Thêm Cổ Đông
          </button>
          
          <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
            <span>Tổng cộng:</span>
            <span style={{ color: localPartners.reduce((s, p) => s + p.share, 0) === 100 ? 'var(--color-success)' : 'var(--color-danger)' }}>
              {localPartners.reduce((s, p) => s + p.share, 0)}%
            </span>
          </div>

        </div>

      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg-base)',
  color: 'var(--color-text-base)',
  outline: 'none',
  boxSizing: 'border-box'
};
