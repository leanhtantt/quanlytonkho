import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconAlertTriangle, IconCloudUpload, IconRefresh } from '@tabler/icons-react';
import { api } from '../lib/api';
import { toast } from './ui/toastHelper';
import Badge from './ui/Badge';
import Button from './ui/Button';
import ConfirmDialog from './ui/ConfirmDialog';
import EmptyState from './ui/EmptyState';
import FormField from './ui/FormField';

function shopLabel(shop) {
  return shop.shopName || `Shop #${shop.id}`;
}

function statusBadge(row) {
  if (row.status === 'UNCHANGED') return <Badge variant="success">Đã khớp</Badge>;
  if (row.status === 'SUCCESS') return <Badge variant="success">Đã đẩy</Badge>;
  if (row.status === 'FAILED') return <Badge variant="danger">Lỗi</Badge>;
  if (row.status === 'READY') return <Badge variant="info">Cần đẩy</Badge>;
  return <Badge variant="warning">Bị chặn</Badge>;
}

export default function ShopeeStockPush({ shops, canView, canPush }) {
  const activeShops = useMemo(() => shops.filter(shop => shop.isActive), [shops]);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [preview, setPreview] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const loadedShopRef = useRef('');
  const requestRef = useRef(0);

  useEffect(() => {
    if (activeShops.some(shop => shop.id === selectedShopId)) return;
    setSelectedShopId(activeShops[0]?.id || '');
    setPreview(null);
    setLastResult(null);
  }, [activeShops, selectedShopId]);

  const loadPreview = useCallback(async () => {
    if (!selectedShopId || !canView) return;
    const shopId = selectedShopId;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setIsLoading(true);
    try {
      const result = await api.getShopeeStockPreview(shopId);
      if (requestRef.current === requestId) setPreview(result);
    } catch (error) {
      if (requestRef.current !== requestId) return;
      toast.error(`Không thể đối chiếu tồn Shopee: ${error.message}`);
    } finally {
      if (requestRef.current === requestId) setIsLoading(false);
    }
  }, [canView, selectedShopId]);

  useEffect(() => {
    if (!selectedShopId || loadedShopRef.current === selectedShopId) return;
    loadedShopRef.current = selectedShopId;
    void loadPreview();
  }, [loadPreview, selectedShopId]);

  const runPush = async () => {
    if (!selectedShopId || !canPush) return;
    setIsPushing(true);
    try {
      const result = await api.pushShopeeStock(selectedShopId);
      setLastResult(result);
      setPreview({
        shopId: result.shopId,
        generatedAt: result.pushedAt,
        summary: {
          total: result.summary.total,
          ready: result.summary.failed,
          unchanged: result.summary.pushed + result.summary.unchanged,
          blocked: result.summary.blocked,
        },
        rows: result.rows,
      });
      setConfirmOpen(false);
      if (result.status === 'SUCCESS') {
        toast.success(`Đã đẩy ${result.summary.pushed} tồn kho lên Shopee.`);
      } else {
        toast.warning(`Đẩy tồn một phần: ${result.summary.pushed} thành công, ${result.summary.failed} lỗi, ${result.summary.blocked} bị chặn.`);
      }
      if (result.auditWarning) toast.warning(result.auditWarning);
    } catch (error) {
      toast.error(`Không thể đẩy tồn Shopee: ${error.message}`);
    } finally {
      setIsPushing(false);
    }
  };

  if (activeShops.length === 0) {
    return <EmptyState icon={IconCloudUpload} title="Chưa có shop Shopee đang kết nối" description="Kết nối và mapping sản phẩm trước khi đẩy tồn." />;
  }

  const summary = preview?.summary || { total: 0, ready: 0, unchanged: 0, blocked: 0 };
  const rows = preview?.rows || [];
  return (
    <div className="shopee-stock-push">
      <div className="shopee-mapping__toolbar">
        <FormField label="Shop Shopee" className="shopee-mapping__shop-select">
          <select
            value={selectedShopId}
            onChange={event => {
              loadedShopRef.current = '';
              setSelectedShopId(event.target.value);
              setPreview(null);
              setLastResult(null);
            }}
          >
            {activeShops.map(shop => <option key={shop.id} value={shop.id}>{shopLabel(shop)}</option>)}
          </select>
        </FormField>
        <div className="shopee-mapping__actions">
          <Button variant="secondary" icon={IconRefresh} loading={isLoading} onClick={loadPreview}>
            Đối chiếu lại
          </Button>
          {canPush ? (
            <Button
              icon={IconCloudUpload}
              disabled={isLoading || summary.ready === 0}
              onClick={() => setConfirmOpen(true)}
            >
              Đẩy {summary.ready} thay đổi
            </Button>
          ) : null}
        </div>
      </div>

      <div className="shopee-mapping__summary" aria-live="polite" aria-busy={isLoading}>
        <Badge variant="info">{summary.total} mapping</Badge>
        <Badge variant={summary.ready ? 'warning' : 'success'}>{summary.ready} cần đẩy</Badge>
        <Badge variant="success">{summary.unchanged} đã khớp</Badge>
        <Badge variant={summary.blocked ? 'warning' : 'info'}>{summary.blocked} bị chặn</Badge>
      </div>

      {lastResult ? (
        <div className="shopee-stock-push__result" role="status">
          <strong>Kết quả lần đẩy gần nhất:</strong>
          <span>{lastResult.summary.pushed} thành công · {lastResult.summary.unchanged} không đổi · {lastResult.summary.failed} lỗi · {lastResult.summary.blocked} bị chặn</span>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="table-responsive shopee-stock-push__table">
          <table>
            <thead>
              <tr><th>Sản phẩm Shopee</th><th>SKU nội bộ</th><th>Tồn app</th><th>Tồn Shopee</th><th>Trạng thái</th></tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={`${row.itemId}:${row.modelId}`}>
                  <td>
                    <strong>{row.itemName}</strong>
                    {row.modelName ? <span className="shopee-mapping__id">{row.modelName}</span> : null}
                    <span className="shopee-mapping__id">Item {row.itemId}{row.modelId !== '0' ? ` · Model ${row.modelId}` : ''}</span>
                  </td>
                  <td><code>{row.productSku || '—'}</code><span className="shopee-mapping__id">{row.productName}</span></td>
                  <td><strong>{row.appStock ?? '—'}</strong></td>
                  <td>{row.shopeeStock ?? '—'}{row.locationId ? <span className="shopee-mapping__id">Kho {row.locationId}</span> : null}</td>
                  <td>
                    {statusBadge(row)}
                    {row.message ? <span className="shopee-stock-push__message"><IconAlertTriangle size={15} aria-hidden="true" />{row.message}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="settings-card__help">Chưa có sản phẩm Shopee nào được mapping để đẩy tồn.</p>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => !isPushing && setConfirmOpen(false)}
        onConfirm={runPush}
        loading={isPushing}
        title="Đẩy tồn app lên Shopee"
        action="Đẩy tồn"
        confirmLabel="Đẩy lên Shopee"
        description={`Shopee sẽ nhận tồn hiện tại của ${summary.ready} item/model đã mapping. ${summary.blocked} dòng bị chặn sẽ được bỏ qua và không thay đổi.`}
      />
    </div>
  );
}
