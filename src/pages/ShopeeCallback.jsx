import { useEffect, useRef, useState } from 'react';
import { IconAlertTriangle as AlertTriangle, IconCircleCheck as CircleCheck, IconSettings as SettingsIcon } from '@tabler/icons-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import Button from '../components/ui/Button';

function shopLabel(shop) {
  return shop?.shopName || (shop?.id ? `Shop #${shop.id}` : 'shop Shopee');
}

export default function ShopeeCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const submittedRef = useRef(false);
  const [status, setStatus] = useState({ phase: 'loading', message: 'Đang xác nhận kết nối với Shopee…', shop: null });

  useEffect(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    const params = new URLSearchParams(location.search);
    const code = params.get('code')?.trim();
    const shopId = params.get('shop_id')?.trim();
    if (!code || !shopId) {
      setStatus({
        phase: 'error',
        message: 'Shopee không trả đủ mã xác nhận hoặc mã shop. Hãy quay lại Cài Đặt và thử kết nối lại.',
        shop: null,
      });
      return;
    }

    // Authorization code chỉ dùng một lần; bỏ nó khỏi URL ngay sau khi đã đọc.
    window.history.replaceState(null, '', location.pathname);

    // Không dùng cờ active/cleanup: StrictMode (dev) mount 2 lần — submittedRef đã
    // chặn request thứ hai, nên cleanup của lần mount đầu sẽ vô hiệu hóa callback
    // của request DUY NHẤT và làm UI kẹt ở "Đang xác nhận" vĩnh viễn.
    api.connectShopee({ code, shop_id: shopId })
      .then(({ shop }) => {
        setStatus({
          phase: 'success',
          message: `Đã kết nối ${shopLabel(shop)}. Bạn có thể quay lại Cài Đặt để kiểm tra trạng thái.`,
          shop,
        });
      })
      .catch((error) => {
        setStatus({
          phase: 'error',
          message: error.message || 'Không thể kết nối shop Shopee. Vui lòng thử lại từ Cài Đặt.',
          shop: null,
        });
      });
  }, [location.pathname, location.search]);

  const isLoading = status.phase === 'loading';
  const isSuccess = status.phase === 'success';

  return (
    <section className="card shopee-callback-card" aria-live="polite" aria-busy={isLoading || undefined}>
      {isSuccess ? <CircleCheck size={36} className="shopee-callback-card__icon is-success" aria-hidden="true" /> : null}
      {status.phase === 'error' ? <AlertTriangle size={36} className="shopee-callback-card__icon is-error" aria-hidden="true" /> : null}
      <h1 className="h2">{isLoading ? 'Đang kết nối Shopee' : isSuccess ? 'Kết nối thành công' : 'Không thể kết nối Shopee'}</h1>
      <p className="shopee-callback-card__message">{status.message}</p>
      {!isLoading ? (
        <Button icon={SettingsIcon} onClick={() => navigate('/settings', { replace: true })}>
          Về Cài Đặt
        </Button>
      ) : null}
    </section>
  );
}
