import { useMemo } from 'react';
import { IconReceipt as Receipt, IconWallet as Wallet } from '@tabler/icons-react';
import { useAppStore } from '../store/appStoreContext';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
}

export default function Expenses() {
  const { transactions, orders, defaultPackagingCost } = useAppStore();

  // ponytail: derive packaging comparison from existing transactions + orders, no new API calls
  const packagingComparison = useMemo(() => {
    const monthMap = {};
    // Material purchase costs from treasury transactions
    (transactions || []).forEach(t => {
      if (t.type === 'CHI' && t.category === 'Mua vật liệu đóng gói') {
        const m = t.date?.slice(0, 7);
        if (!m) return;
        if (!monthMap[m]) monthMap[m] = { month: m, materialCost: 0, packagingFeeTotal: 0, orderCount: 0 };
        monthMap[m].materialCost += Number(t.amount) || 0;
      }
    });
    // Per-order packaging fees from orders
    (orders || []).forEach(o => {
      const m = o.date?.slice(0, 7);
      if (!m) return;
      if (!monthMap[m]) monthMap[m] = { month: m, materialCost: 0, packagingFeeTotal: 0, orderCount: 0 };
      monthMap[m].packagingFeeTotal += o.packagingFee !== undefined ? Number(o.packagingFee) : (defaultPackagingCost || 0);
      monthMap[m].orderCount += 1;
    });
    return Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));
  }, [transactions, orders, defaultPackagingCost]);

  const totals = useMemo(() => {
    if (packagingComparison.length === 0) return null;
    return packagingComparison.reduce(
      (acc, r) => ({
        materialCost: acc.materialCost + r.materialCost,
        packagingFeeTotal: acc.packagingFeeTotal + r.packagingFeeTotal,
        orderCount: acc.orderCount + r.orderCount,
      }),
      { materialCost: 0, packagingFeeTotal: 0, orderCount: 0 }
    );
  }, [packagingComparison]);

  return (
    <div className="animate-fade-in expenses-page">
      <PageHeader
        title="Chi Phí"
        description="Theo dõi và so sánh các khoản chi phí vận hành"
      />

      <section className="card expenses-section" aria-labelledby="expenses-packaging-title">
        <h2 id="expenses-packaging-title" className="h3">Vật Liệu Đóng Gói vs Phí Đóng Hàng</h2>
        <p className="expenses-section__description">
          So sánh tổng tiền <strong>mua vật liệu đóng gói</strong> (hộp, túi, băng keo…) với tổng <strong>phí đóng hàng tính vào đơn</strong> theo từng tháng mua, để xem chi phí thực tế có cân với phí thu trên đơn hay không.
        </p>
        {packagingComparison.length === 0 ? (
          <EmptyState icon={Wallet} title="Chưa có dữ liệu" description="Ghi nhận giao dịch mua vật liệu đóng gói hoặc đơn hàng để xem so sánh." />
        ) : (
          <div className="table-responsive">
            <table className="table expenses-packaging-table">
              <thead>
                <tr>
                  <th>Tháng</th>
                  <th className="num">Chi mua VLĐG</th>
                  <th className="num">Phí đóng hàng (trên đơn)</th>
                  <th className="num">Số đơn</th>
                  <th className="num">Chênh lệch</th>
                </tr>
              </thead>
              <tbody>
                {packagingComparison.map(row => {
                  const diff = row.packagingFeeTotal - row.materialCost;
                  return (
                    <tr key={row.month}>
                      <td>{row.month}</td>
                      <td className="num treasury-value--expense">{formatCurrency(row.materialCost)}</td>
                      <td className="num treasury-value--info">{formatCurrency(row.packagingFeeTotal)}</td>
                      <td className="num">{row.orderCount}</td>
                      <td className={`num treasury-value--strong ${diff < 0 ? 'treasury-value--expense' : 'treasury-value--income'}`}>
                        {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                      </td>
                    </tr>
                  );
                })}
                {totals && packagingComparison.length > 1 && (() => {
                  const totalDiff = totals.packagingFeeTotal - totals.materialCost;
                  return (
                    <tr className="profit-total-row">
                      <td><strong>Tổng</strong></td>
                      <td className="num treasury-value--expense"><strong>{formatCurrency(totals.materialCost)}</strong></td>
                      <td className="num treasury-value--info"><strong>{formatCurrency(totals.packagingFeeTotal)}</strong></td>
                      <td className="num"><strong>{totals.orderCount}</strong></td>
                      <td className={`num treasury-value--strong ${totalDiff < 0 ? 'treasury-value--expense' : 'treasury-value--income'}`}>
                        <strong>{totalDiff >= 0 ? '+' : ''}{formatCurrency(totalDiff)}</strong>
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
