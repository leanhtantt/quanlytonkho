import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { api } from '../lib/api';
import { toast } from './ui/toastHelper';
import Badge from './ui/Badge';
import Button from './ui/Button';
import EmptyState from './ui/EmptyState';
import FormField from './ui/FormField';

function shopLabel(shop) {
  return shop.shopName || `Shop #${shop.id}`;
}

function formatDate(value) {
  if (!value) return 'Chưa đồng bộ';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function ShopeeOrderSync({ shops, canView, canSync }) {
  const activeShops = useMemo(() => shops.filter(shop => shop.isActive), [shops]);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [status, setStatus] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const loadedShopRef = useRef('');
  const requestRef = useRef(0);

  useEffect(() => {
    if (activeShops.some(shop => shop.id === selectedShopId)) return;
    setSelectedShopId(activeShops[0]?.id || '');
    setStatus(null);
    setLastResult(null);
  }, [activeShops, selectedShopId]);

  const loadStatus = useCallback(async () => {
    if (!selectedShopId || !canView) return;
    const shopId = selectedShopId;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setIsLoading(true);
    try {
      const nextStatus = await api.getShopeeOrderSyncStatus(shopId);
      if (requestRef.current === requestId) setStatus(nextStatus);
    } catch (error) {
      if (requestRef.current !== requestId) return;
      toast.error(`Không thể tải trạng thái đồng bộ Shopee: ${error.message}`);
    } finally {
      if (requestRef.current === requestId) setIsLoading(false);
    }
  }, [canView, selectedShopId]);

  useEffect(() => {
    if (!selectedShopId || loadedShopRef.current === selectedShopId) return;
    loadedShopRef.current = selectedShopId;
    void loadStatus();
  }, [loadStatus, selectedShopId]);

  const runSync = async () => {
    if (!selectedShopId || !canSync) return;
    setIsSyncing(true);
    try {
      const result = await api.syncShopeeOrders(selectedShopId);
      setStatus(result);
      setLastResult(result);
      toast.success(`Đồng bộ xong: ${result.created} đơn mới, ${result.pending} đơn chờ xử lý.`);
    } catch (error) {
      toast.error(`Không thể đồng bộ đơn Shopee: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  if (activeShops.length === 0) {
    return <EmptyState icon={IconRefresh} title="Chưa có shop Shopee đang kết nối" description="Kết nối shop trước khi đồng bộ đơn hàng." />;
  }

  const pendingIssues = status?.pendingIssues || [];
  return (
    <div className="shopee-sync">
      <div className="shopee-mapping__toolbar">
        <FormField label="Shop Shopee" className="shopee-mapping__shop-select">
          <select
            value={selectedShopId}
            onChange={event => {
              setSelectedShopId(event.target.value);
              setStatus(null);
              setLastResult(null);
            }}
          >
            {activeShops.map(shop => <option key={shop.id} value={shop.id}>{shopLabel(shop)}</option>)}
          </select>
        </FormField>
        {canSync ? <Button icon={IconRefresh} loading={isSyncing} onClick={runSync}>Đồng bộ đơn ngay</Button> : null}
      </div>

      <div className="shopee-sync__summary" aria-live="polite" aria-busy={isLoading}>
        <span className="settings-card__help">Lần đồng bộ cuối: {formatDate(status?.lastOrderSyncAt)}</span>
        <Badge variant={pendingIssues.length ? 'warning' : 'success'}>{pendingIssues.length} đơn chờ xử lý</Badge>
      </div>

      {lastResult ? (
        <div className="shopee-mapping__summary">
          <Badge variant="success">{lastResult.created} mới</Badge>
          <Badge variant="info">{lastResult.updated} cập nhật</Badge>
          <Badge variant="info">{lastResult.unchanged} không đổi</Badge>
          <Badge variant={lastResult.reversed ? 'warning' : 'info'}>{lastResult.reversed} đảo hủy</Badge>
          <Badge variant="info">{lastResult.skipped} bỏ qua</Badge>
        </div>
      ) : null}

      {pendingIssues.length > 0 ? (
        <div className="table-responsive shopee-sync__pending">
          <table>
            <thead><tr><th>Đơn Shopee</th><th>Trạng thái</th><th>Item chưa mapping</th></tr></thead>
            <tbody>
              {pendingIssues.map(issue => (
                <tr key={issue.id}>
                  <td><strong>{issue.orderSn}</strong><span className="shopee-mapping__id">Gặp lần đầu {formatDate(issue.firstSeenAt)}</span></td>
                  <td><Badge variant="warning">{issue.orderStatus}</Badge></td>
                  <td>
                    {(issue.unmappedItems || []).map(item => (
                      <span className="shopee-sync__unmapped" key={`${item.itemId}:${item.modelId}`}>
                        <IconAlertTriangle size={16} aria-hidden="true" />
                        {item.itemName}{item.modelName ? ` · ${item.modelName}` : ''} — {item.sku || 'chưa có SKU'} × {item.qty}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="settings-card__help">Không có đơn nào bị chặn vì thiếu mapping sản phẩm.</p>
      )}
    </div>
  );
}
