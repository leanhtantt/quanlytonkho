import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStoreContext';
import {
  IconBuildingStore,
  IconDeviceFloppy as Save,
  IconPlus as Plus,
  IconTrash as Trash2,
  IconUsers,
  IconWallet,
  IconLink as LinkIcon,
  IconShoppingBag,
  IconCloudUpload,
  IconUnlink as Unlink,
} from '@tabler/icons-react';
import { deleteImage, getImage } from '../domain/imageDb';
import { deleteProductImage, isRemoteImage, uploadProductImage } from '../domain/imageStorage';
import { toast } from '../components/ui/toastHelper';
import Button from '../components/ui/Button';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import FormField from '../components/ui/FormField';
import ShopeeProductMapping from '../components/ShopeeProductMapping';
import ShopeeOrderSync from '../components/ShopeeOrderSync';
import ShopeeStockPush from '../components/ShopeeStockPush';

function formatShopeeDate(value) {
  if (!value) return 'Chưa có dữ liệu';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa có dữ liệu';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function getShopeeShopLabel(shop) {
  return shop.shopName || `Shop #${shop.id}`;
}
export default function Settings() {
  const { accounts, setAccounts, shops, setShops, partners, setPartners, products, updateProduct, defaultPackagingCost, setDefaultPackagingCost, defaultReturnFee, setDefaultReturnFee } = useAppStore();
  const { can } = useAuth();

  const [localAccounts, setLocalAccounts] = useState([...accounts]);
  const [localShops, setLocalShops] = useState([...shops]);
  const [localPartners, setLocalPartners] = useState(partners.map(p => ({...p})));
  const [localPkgCost, setLocalPkgCost] = useState(defaultPackagingCost);
  const [localReturnFee, setLocalReturnFee] = useState(defaultReturnFee);
  const [newAccount, setNewAccount] = useState('');
  const [newShop, setNewShop] = useState('');
  const [imageMigration, setImageMigration] = useState({ running: false, completed: 0, total: 0, failed: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [shopeeShops, setShopeeShops] = useState([]);
  const [isShopeeLoading, setIsShopeeLoading] = useState(true);
  const [isConnectingShopee, setIsConnectingShopee] = useState(false);
  const [pendingShopeeDisconnect, setPendingShopeeDisconnect] = useState(null);
  const [disconnectingShopId, setDisconnectingShopId] = useState(null);

  const legacyImageProducts = products.filter(product => product.imageId && !isRemoteImage(product.imageId));
  useEffect(() => {
    if (!can('settings', 'view')) return undefined;

    let active = true;
    api.getShopeeShops()
      .then(({ shops: nextShops = [] }) => {
        if (active) setShopeeShops(nextShops);
      })
      .catch((error) => {
        if (active) toast.error(`Không thể tải trạng thái Shopee: ${error.message}`);
      })
      .finally(() => {
        if (active) setIsShopeeLoading(false);
      });

    return () => {
      active = false;
    };
  }, [can]);

  const handleMigrateImages = async () => {
    if (legacyImageProducts.length === 0) {
      toast.success('Tất cả ảnh sản phẩm đã nằm trên Firebase Storage.');
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
    if (failed === 0) {
      toast.success(`Đã chuyển thành công ${completed} ảnh lên Firebase Storage.`);
    } else {
      toast.error(`Đã chuyển ${completed} ảnh; ${failed} ảnh lỗi và vẫn được giữ nguyên.`);
    }
  };


  const handleConnectShopee = async () => {
    if (!can('settings', 'update')) return;

    setIsConnectingShopee(true);
    try {
      const { authorizationUrl } = await api.getShopeeAuthorizationUrl();
      if (!authorizationUrl) throw new Error('Không nhận được link ủy quyền từ Shopee.');
      window.location.assign(authorizationUrl);
    } catch (error) {
      toast.error(`Không thể bắt đầu kết nối Shopee: ${error.message}`);
      setIsConnectingShopee(false);
    }
  };

  const handleDisconnectShopee = async () => {
    if (!pendingShopeeDisconnect) return;

    setDisconnectingShopId(pendingShopeeDisconnect.id);
    try {
      const { shop } = await api.disconnectShopeeShop(pendingShopeeDisconnect.id);
      setShopeeShops(current => current.map(item => item.id === shop.id ? shop : item));
      toast.success(`Đã ngắt kết nối ${getShopeeShopLabel(shop)}.`);
      setPendingShopeeDisconnect(null);
    } catch (error) {
      toast.error(`Không thể ngắt kết nối Shopee: ${error.message}`);
    } finally {
      setDisconnectingShopId(null);
    }
  };
  const handleAddShop = () => {
    const name = newShop.trim();
    if (!name) return;
    if (localShops.some(shop => shop.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'))) {
      toast.error('Tên shop đã tồn tại.');
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

  const handleConfirmRemoval = () => {
    if (!pendingRemoval) return;
    if (pendingRemoval.type === 'shop') {
      setLocalShops(current => current.filter(item => item !== pendingRemoval.value));
    } else if (pendingRemoval.type === 'account') {
      handleRemoveAccount(pendingRemoval.value);
    } else if (pendingRemoval.type === 'partner') {
      handleRemovePartner(pendingRemoval.index);
    }
    setPendingRemoval(null);
  };

  const handleSave = async () => {
    if (localShops.length === 0) {
      toast.error('Cần giữ lại ít nhất một shop để tạo và import đơn hàng.');
      return;
    }
    const totalShare = localPartners.reduce((sum, p) => sum + p.share, 0);
    if (totalShare !== 100) {
      toast.error(`Tổng tỷ lệ chia lợi nhuận phải bằng 100%. Hiện tại đang là ${totalShare}%`);
      return;
    }
    // Prevent duplicate partner names or empty names
    const names = localPartners.map(p => p.name.trim()).filter(Boolean);
    if (new Set(names).size !== names.length || names.length !== localPartners.length) {
      toast.error('Tên thành viên không được để trống và không được trùng lặp.');
      return;
    }

    setIsSaving(true);
    try {
      await Promise.all([
        setAccounts(localAccounts),
        setShops(localShops),
        setPartners(localPartners),
        setDefaultPackagingCost(Number(localPkgCost) || 0),
        setDefaultReturnFee(Number(localReturnFee) || 0)
      ]);
      toast.success('Đã lưu cấu hình thành công.');
    } catch (error) {
      toast.error(`Không thể lưu cấu hình: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Cài Đặt Hệ Thống"
        description="Quản lý shop, tài khoản và tỷ lệ chia lợi nhuận"
        actions={can('settings', 'update') ? <Button icon={Save} loading={isSaving} onClick={handleSave}>
          {isSaving ? 'Đang lưu...' : 'Lưu Thay Đổi'}
        </Button> : null}
      />

      <div className="settings-grid">
        
        {/* General Settings */}
        <div className="card settings-card settings-card--wide">
          <h2 className="h3 settings-card__title">
            Cấu Hình Chung
          </h2>
          <div className="settings-fee-grid">
            <FormField label="Phí đóng gói mặc định / 1 Đơn">
              <input 
                type="number" 
                value={localPkgCost} 
                onChange={e => setLocalPkgCost(e.target.value)} 
              />
            </FormField>
            <FormField label="Phí hoàn đơn mặc định">
              <input 
                type="number" 
                value={localReturnFee} 
                onChange={e => setLocalReturnFee(e.target.value)} 
              />
            </FormField>
          </div>
          <p className="settings-card__help">
            Mức phí này sẽ được tự động áp dụng khi tạo mới hoặc tải file Excel lên (Phí hoàn chỉ áp dụng cho đơn Hoàn). Bạn có thể ghi đè cho từng đơn cụ thể ở trang Xuất Bán.
          </p>
        </div>

        <div className="card settings-card settings-card--wide">
          <h2 className="h3 settings-card__title">Lưu Trữ Ảnh Sản Phẩm</h2>
          <p className="settings-card__description">
            Ảnh mới được lưu trên Firebase Storage. Công cụ này chuyển ảnh cũ ra khỏi database/trình duyệt mà không làm thay đổi sản phẩm hoặc tồn kho.
          </p>
          <div className="settings-migration">
            {can('products', 'create') && can('products', 'update') && <Button variant="secondary" loading={imageMigration.running} onClick={handleMigrateImages} disabled={legacyImageProducts.length === 0}>
              {imageMigration.running ? 'Đang chuyển ảnh...' : `Chuyển ${legacyImageProducts.length} ảnh cũ lên Storage`}
            </Button>}
            <Badge variant={legacyImageProducts.length === 0 ? 'success' : 'info'}>
              {imageMigration.running
                ? `${imageMigration.completed}/${imageMigration.total} hoàn tất${imageMigration.failed ? `, ${imageMigration.failed} lỗi` : ''}`
                : legacyImageProducts.length === 0 ? 'Tất cả ảnh đã được lưu an toàn trên Storage' : `${legacyImageProducts.length} ảnh đang chờ chuyển`}
            </Badge>
          </div>
        </div>

        <div className="card settings-card settings-card--wide">
          <h2 className="h3 settings-card__title settings-card__title--with-icon">
            <IconShoppingBag size={22} aria-hidden="true" />
            Kết Nối Shopee
          </h2>
          <p className="settings-card__description">
            Ủy quyền shop Shopee để chuẩn bị đồng bộ đơn hàng và tồn kho. Access token chỉ được lưu ở backend, không hiển thị trên trình duyệt.
          </p>

          {isShopeeLoading ? <p className="settings-card__help" aria-busy="true">Đang tải trạng thái kết nối Shopee…</p> : null}
          {!isShopeeLoading && shopeeShops.length === 0 ? (
            <EmptyState icon={IconShoppingBag} title="Chưa kết nối shop Shopee" description="Bấm Kết nối Shopee để bắt đầu ủy quyền shop." />
          ) : null}
          {!isShopeeLoading && shopeeShops.length > 0 ? (
            <ul className="settings-list shopee-shop-list">
              {shopeeShops.map(shop => (
                <li key={shop.id} className="settings-list__item">
                  <div className="settings-list__content">
                    <span className="settings-list__name">{getShopeeShopLabel(shop)}</span>
                    <span className="settings-list__meta">
                      {shop.region} · Token truy cập đến {formatShopeeDate(shop.expiresAt)} · Ủy quyền đến {formatShopeeDate(shop.authExpiresAt)}
                    </span>
                  </div>
                  <div className="settings-list__actions">
                    <Badge variant={shop.isActive ? 'success' : 'info'}>{shop.isActive ? 'Đang kết nối' : 'Đã ngắt'}</Badge>
                    {can('settings', 'update') && shop.isActive ? (
                      <Button
                        variant="danger-ghost"
                        size="sm"
                        icon={Unlink}
                        onClick={() => setPendingShopeeDisconnect(shop)}
                        loading={disconnectingShopId === shop.id}
                      >
                        Ngắt kết nối
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {can('settings', 'update') ? (
            <div className="settings-migration shopee-connection-actions">
              <Button icon={LinkIcon} loading={isConnectingShopee} onClick={handleConnectShopee}>
                {isConnectingShopee ? 'Đang mở Shopee…' : 'Kết nối Shopee'}
              </Button>
              <span className="settings-card__help">Bạn sẽ được chuyển sang Shopee để ủy quyền, sau đó quay lại ứng dụng để hoàn tất.</span>
            </div>
          ) : null}
        </div>
        <div className="card settings-card settings-card--wide">
          <h2 className="h3 settings-card__title settings-card__title--with-icon">
            <IconShoppingBag size={22} aria-hidden="true" />
            Ánh Xạ Sản Phẩm Shopee
          </h2>
          <p className="settings-card__description">
            Kiểm tra SKU trên sàn, duyệt gợi ý tự động và chọn sản phẩm nội bộ cho từng phân loại.
          </p>
          <ShopeeProductMapping shops={shopeeShops} canUpdate={can('settings', 'update')} />
        </div>
        <div className="card settings-card settings-card--wide">
          <h2 className="h3 settings-card__title settings-card__title--with-icon">
            <IconCloudUpload size={22} aria-hidden="true" />
            Đẩy Tồn Kho Lên Shopee
          </h2>
          <p className="settings-card__description">
            Đối chiếu tồn khả dụng của app với từng item/model đã mapping và chỉ đẩy khi bạn xác nhận. Chưa bật cron hay đồng bộ tự động.
          </p>
          <ShopeeStockPush
            shops={shopeeShops}
            canView={can('products', 'view')}
            canPush={can('products', 'update')}
          />
        </div>
        <div className="card settings-card settings-card--wide">
          <h2 className="h3 settings-card__title settings-card__title--with-icon">
            <IconShoppingBag size={22} aria-hidden="true" />
            Đồng Bộ Đơn Hàng Shopee
          </h2>
          <p className="settings-card__description">
            Nhập đơn từ READY_TO_SHIP trở đi qua cùng luồng FIFO và ledger của đơn nhập tay. Đơn thiếu mapping được giữ lại để xử lý, không trừ kho.
          </p>
          <ShopeeOrderSync
            shops={shopeeShops}
            canView={can('orders', 'view')}
            canSync={can('orders', 'create')}
          />
        </div>
        {/* Shops Management */}
        <div className="card settings-card">
          <h2 className="h3 settings-card__title">Danh Sách Shop</h2>
          <p className="settings-card__description">
            Shop mới sẽ xuất hiện khi nhập đơn tay, import Excel và nhập chi phí quảng cáo. Xóa khỏi danh sách không làm mất đơn hàng cũ.
          </p>
          <div className="settings-add-row">
            <input
              type="text"
              value={newShop}
              onChange={e => setNewShop(e.target.value)}
              placeholder="Nhập tên shop mới..."
              onKeyDown={e => can('settings', 'update') && e.key === 'Enter' && handleAddShop()}
            />
            {can('settings', 'update') && <Button variant="secondary" icon={Plus} onClick={handleAddShop}>Thêm</Button>}
          </div>
          <ul className="settings-list">
            {localShops.map(shop => (
              <li key={shop} className="settings-list__item">
                <span className="settings-list__name">{shop}</span>
                {can('settings', 'update') && <Button variant="danger-ghost" size="sm" icon={Trash2} iconOnly aria-label={`Xóa shop ${shop}`} onClick={() => setPendingRemoval({ type: 'shop', value: shop, label: `shop ${shop}` })} />}
              </li>
            ))}
            {localShops.length === 0 && <li><EmptyState icon={IconBuildingStore} title="Chưa có shop nào" description="Thêm shop để dùng khi nhập đơn và chi phí quảng cáo." /></li>}
          </ul>
        </div>

        {/* Accounts Management */}
        <div className="card settings-card">
          <h2 className="h3 settings-card__title">
            Danh Sách Tài Khoản/Quỹ
          </h2>
          <div className="settings-add-row">
            <input 
              type="text" 
              value={newAccount} 
              onChange={e => setNewAccount(e.target.value)} 
              placeholder="Nhập tên tài khoản (VD: Momo, Tiền mặt)..." 
              onKeyDown={e => can('settings', 'update') && e.key === 'Enter' && handleAddAccount()}
            />
            {can('settings', 'update') && <Button variant="secondary" icon={Plus} onClick={handleAddAccount}>Thêm</Button>}
          </div>
          
          <ul className="settings-list">
            {localAccounts.map((acc, idx) => (
              <li key={idx} className="settings-list__item">
                <span className="settings-list__name">{acc}</span>
                {can('settings', 'update') && <Button variant="danger-ghost" size="sm" icon={Trash2} iconOnly aria-label={`Xóa tài khoản ${acc}`} onClick={() => setPendingRemoval({ type: 'account', value: acc, label: `tài khoản ${acc}` })} />}
              </li>
            ))}
            {localAccounts.length === 0 && <li><EmptyState icon={IconWallet} title="Chưa có tài khoản nào" description="Thêm tài khoản hoặc quỹ để ghi nhận dòng tiền." /></li>}
          </ul>
        </div>

        {/* Partners Management */}
        <div className="card settings-card">
          <h2 className="h3 settings-card__title">
            Cổ Đông & Tỷ Lệ Lợi Nhuận
          </h2>
          <p className="settings-card__description">
            Tổng tỷ lệ chia phải bằng đúng 100%. Nếu có Quỹ Shop để tái đầu tư, hãy giữ 1 dòng cho Quỹ Shop.
          </p>

          <div className="settings-partners">
            {localPartners.map((p, idx) => (
              <div key={idx} className="settings-partner-row">
                <FormField label={`Tên thành viên ${idx + 1}`} className="settings-partner-row__name">
                  <input type="text" value={p.name} onChange={e => handleUpdatePartner(idx, 'name', e.target.value)} placeholder="Tên thành viên" />
                </FormField>
                <FormField label="Tỷ lệ (%)" className="settings-partner-row__share">
                  <input className="num" type="number" min="0" max="100" value={p.share} onChange={e => handleUpdatePartner(idx, 'share', e.target.value)} />
                </FormField>
                {can('settings', 'update') && <Button className="settings-partner-row__remove" variant="danger-ghost" size="sm" icon={Trash2} iconOnly aria-label={`Xóa thành viên ${p.name || idx + 1}`} onClick={() => setPendingRemoval({ type: 'partner', index: idx, label: `thành viên ${p.name || idx + 1}` })} />}
              </div>
            ))}
            {localPartners.length === 0 && (
              <EmptyState icon={IconUsers} title="Chưa có thành viên góp vốn" description="Thêm thành viên để cấu hình tỷ lệ chia lợi nhuận." />
            )}
          </div>
          
          {can('settings', 'update') && <Button className="settings-add-partner" variant="secondary" icon={Plus} onClick={handleAddPartner}>Thêm Cổ Đông</Button>}
          
          <div className="settings-share-total">
            <span>Tổng cộng:</span>
            <span className={`num ${localPartners.reduce((s, p) => s + p.share, 0) === 100 ? 'is-valid' : 'is-invalid'}`}>
              {localPartners.reduce((s, p) => s + p.share, 0)}%
            </span>
          </div>

        </div>

      </div>

      <ConfirmDialog
        open={Boolean(pendingRemoval)}
        onClose={() => setPendingRemoval(null)}
        onConfirm={handleConfirmRemoval}
        title="Xóa mục khỏi cấu hình?"
        itemName={pendingRemoval?.label}
        description={pendingRemoval ? `Xóa ${pendingRemoval.label} khỏi cấu hình đang chỉnh sửa? Thay đổi chỉ được áp dụng khi bạn bấm Lưu Thay Đổi.` : undefined}
      />
      <ConfirmDialog
        open={Boolean(pendingShopeeDisconnect)}
        onClose={() => setPendingShopeeDisconnect(null)}
        onConfirm={handleDisconnectShopee}
        title="Ngắt kết nối shop Shopee?"
        itemName={pendingShopeeDisconnect ? getShopeeShopLabel(pendingShopeeDisconnect) : undefined}
        action="Ngắt kết nối"
        confirmLabel="Ngắt kết nối"
        description={pendingShopeeDisconnect ? `Ngắt ${getShopeeShopLabel(pendingShopeeDisconnect)}? Dữ liệu đã đồng bộ trong app không bị xóa; bạn có thể kết nối lại sau.` : undefined}
        loading={Boolean(disconnectingShopId)}
      />
    </div>
  );
}
