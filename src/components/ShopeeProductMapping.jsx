import { useEffect, useMemo, useState } from 'react';
import {
  IconArrowsShuffle,
  IconDeviceFloppy,
  IconRefresh,
} from '@tabler/icons-react';
import { api } from '../lib/api';
import { toast } from './ui/toastHelper';
import Badge from './ui/Badge';
import Button from './ui/Button';
import EmptyState from './ui/EmptyState';
import FormField from './ui/FormField';

function shopLabel(shop) {
  return shop.shopName || `Shop #${shop.id}`;
}

function targetKey(row) {
  return `${row.itemId}:${row.modelId}`;
}

export default function ShopeeProductMapping({ shops, canUpdate }) {
  const activeShops = useMemo(() => shops.filter(shop => shop.isActive), [shops]);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [catalog, setCatalog] = useState(null);
  const [selections, setSelections] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (activeShops.some(shop => shop.id === selectedShopId)) return;
    setSelectedShopId(activeShops[0]?.id || '');
    setCatalog(null);
    setSelections({});
  }, [activeShops, selectedShopId]);

  const loadCatalog = async () => {
    if (!selectedShopId) return;
    setIsLoading(true);
    try {
      const nextCatalog = await api.getShopeeItems(selectedShopId);
      setCatalog(nextCatalog);
      setSelections(Object.fromEntries(nextCatalog.rows.map(row => [
        targetKey(row),
        row.mappedProduct?.id || row.suggestedProduct?.id || '',
      ])));
      if (nextCatalog.rows.length === 0) {
        toast.info('Shop Shopee chưa có sản phẩm đang hoạt động để mapping.');
      }
    } catch (error) {
      setCatalog(null);
      setSelections({});
      toast.error(`Không thể tải sản phẩm Shopee: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const saveMappings = async () => {
    if (!catalog || !selectedShopId) return;
    setIsSaving(true);
    try {
      const mappings = catalog.rows.map(row => ({
        itemId: row.itemId,
        modelId: row.modelId,
        productId: selections[targetKey(row)] || null,
      }));
      const result = await api.saveShopeeItemMappings(selectedShopId, mappings);
      const productById = new Map(catalog.products.map(product => [product.id, product]));
      setCatalog(current => ({
        ...current,
        rows: current.rows.map(row => {
          const product = productById.get(selections[targetKey(row)]);
          return {
            ...row,
            mappedProduct: product ? { id: product.id, sku: product.sku, name: product.name } : null,
            suggestedProduct: null,
          };
        }),
      }));
      toast.success(`Đã lưu ${result.saved}/${result.total} mapping sản phẩm Shopee.`);
    } catch (error) {
      toast.error(`Không thể lưu mapping Shopee: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCount = catalog
    ? catalog.rows.filter(row => Boolean(selections[targetKey(row)])).length
    : 0;

  if (activeShops.length === 0) {
    return (
      <EmptyState
        icon={IconArrowsShuffle}
        title="Chưa có shop Shopee đang kết nối"
        description="Kết nối lại shop trước khi tải và ánh xạ sản phẩm."
      />
    );
  }

  return (
    <div className="shopee-mapping">
      <div className="shopee-mapping__toolbar">
        <FormField label="Shop Shopee" className="shopee-mapping__shop-select">
          <select
            value={selectedShopId}
            onChange={event => {
              setSelectedShopId(event.target.value);
              setCatalog(null);
              setSelections({});
            }}
          >
            {activeShops.map(shop => <option key={shop.id} value={shop.id}>{shopLabel(shop)}</option>)}
          </select>
        </FormField>
        <div className="shopee-mapping__actions">
          <Button variant="secondary" icon={IconRefresh} loading={isLoading} onClick={loadCatalog}>
            {catalog ? 'Tải lại từ Shopee' : 'Tải sản phẩm Shopee'}
          </Button>
          {canUpdate && catalog?.rows.length > 0 ? (
            <Button icon={IconDeviceFloppy} loading={isSaving} onClick={saveMappings}>
              Lưu mapping ({selectedCount}/{catalog.rows.length})
            </Button>
          ) : null}
        </div>
      </div>

      {!catalog && !isLoading ? (
        <p className="settings-card__help">
          Tải danh sách để tự khớp SKU Shopee với SKU hiện tại và các mã SKU cũ trong hệ thống.
        </p>
      ) : null}

      {catalog && catalog.rows.length === 0 ? (
        <EmptyState
          icon={IconArrowsShuffle}
          title="Shop Shopee chưa có sản phẩm"
          description="Tạo sản phẩm trong Seller Center sandbox, sau đó bấm Tải lại từ Shopee."
        />
      ) : null}

      {catalog?.rows.length > 0 ? (
        <>
          <div className="shopee-mapping__summary" aria-live="polite">
            <Badge variant="success">{selectedCount} đã chọn</Badge>
            <Badge variant={selectedCount === catalog.rows.length ? 'success' : 'warning'}>
              {catalog.rows.length - selectedCount} chưa khớp
            </Badge>
          </div>
          <div className="table-responsive shopee-mapping__table-wrap">
            <table className="shopee-mapping__table">
              <thead>
                <tr>
                  <th>Sản phẩm Shopee</th>
                  <th>SKU sàn</th>
                  <th>Trạng thái</th>
                  <th>Sản phẩm nội bộ</th>
                </tr>
              </thead>
              <tbody>
                {catalog.rows.map(row => {
                  const key = targetKey(row);
                  const selectedProductId = selections[key] || '';
                  const isPersisted = row.mappedProduct?.id === selectedProductId;
                  const isSuggested = !row.mappedProduct && row.suggestedProduct?.id === selectedProductId;
                  const hasSelection = Boolean(selectedProductId);
                  return (
                    <tr key={key}>
                      <td>
                        <strong>{row.itemName}</strong>
                        {row.modelName ? <span className="shopee-mapping__model">{row.modelName}</span> : null}
                        <span className="shopee-mapping__id">Item {row.itemId}{row.modelId !== '0' ? ` · Model ${row.modelId}` : ''}</span>
                      </td>
                      <td><code>{row.shopeeSku || 'Chưa có SKU'}</code></td>
                      <td>
                        {isPersisted ? <Badge variant="success">Đã lưu</Badge> : null}
                        {isSuggested ? <Badge variant="info">Gợi ý theo SKU</Badge> : null}
                        {hasSelection && !isPersisted && !isSuggested ? <Badge variant="info">Đã thay đổi</Badge> : null}
                        {!hasSelection ? <Badge variant="warning">Chưa mapping</Badge> : null}
                      </td>
                      <td>
                        <label className="sr-only" htmlFor={`shopee-map-${key}`}>Sản phẩm nội bộ cho {row.itemName} {row.modelName || ''}</label>
                        <select
                          id={`shopee-map-${key}`}
                          value={selectedProductId}
                          disabled={!canUpdate || isSaving}
                          onChange={event => setSelections(current => ({ ...current, [key]: event.target.value }))}
                        >
                          <option value="">Chưa mapping</option>
                          {catalog.products.map(product => (
                            <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
