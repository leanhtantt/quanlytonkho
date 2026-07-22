import { IconHistory } from '@tabler/icons-react';
import { useAppStore } from '../store/appStoreContext';
import { formatHistoryRange } from '../domain/historyPeriod';
import Button from './ui/Button';

export default function HistoryRangeControl() {
  const { historyRange, loadOlderHistory, loadingOlderHistory } = useAppStore();
  if (!historyRange) return null;

  return (
    <div className="history-range-control" role="status">
      <span><IconHistory size={18} /> Đang hiển thị dữ liệu từ {formatHistoryRange(historyRange)}</span>
      <Button variant="secondary" size="sm" onClick={loadOlderHistory} disabled={loadingOlderHistory}>
        {loadingOlderHistory ? 'Đang tải…' : 'Xem thêm 3 tháng trước'}
      </Button>
    </div>
  );
}
