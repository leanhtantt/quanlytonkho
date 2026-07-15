import React, { useMemo, useState } from 'react';
import { IconWallet as Wallet, IconTrash as Trash2 } from '@tabler/icons-react';
import { useAppStore } from '../store/appStoreContext';
import { calculateAdAdvanceSummary } from '../domain/profitAnalytics';
import { toast } from '../components/ui/toastHelper';
import { useAuth } from '../lib/AuthContext';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import FormField from '../components/ui/FormField';

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
}

function getAdSourceLabel(source) {
  if (source === 'SELF_FUNDED') return 'Chi trực tiếp từ quỹ shop';
  if (source === 'PERSONAL_ADVANCE') return 'Cá nhân ứng trước';
  if (source === 'SHOPEE_WALLET') return 'Ví Shopee';
  return 'Shopee tự trừ trong đơn';
}

export default function Expenses() {
  const { transactions, orders, defaultPackagingCost, ads, addAd, reimburseAdAdvance, deleteAd, accounts, partners, shops } = useAppStore();
  const { can } = useAuth();

  // ── Ad form state ──
  const [adMonth, setAdMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [adShop, setAdShop] = useState('');
  const [adAmount, setAdAmount] = useState('');
  const [adSource, setAdSource] = useState('DEDUCTED_FROM_REVENUE');
  const [adAccount, setAdAccount] = useState(accounts[0] || '');
  const [adAdvancedBy, setAdAdvancedBy] = useState(partners[0]?.name || '');
  const [adDate, setAdDate] = useState(new Date().toISOString().split('T')[0]);
  const [adNote, setAdNote] = useState('');
  const [isSavingAd, setIsSavingAd] = useState(false);

  // ── Reimbursement state ──
  const [repayingAdvanceId, setRepayingAdvanceId] = useState(null);
  const [reimbursementAmount, setReimbursementAmount] = useState('');
  const [reimbursementDate, setReimbursementDate] = useState(new Date().toISOString().split('T')[0]);
  const [reimbursementSource, setReimbursementSource] = useState('TREASURY_ACCOUNT');
  const [reimbursementAccount, setReimbursementAccount] = useState(accounts[0] || '');
  const [reimbursementNote, setReimbursementNote] = useState('');
  const [isSavingReimbursement, setIsSavingReimbursement] = useState(false);

  // ── Delete state ──
  const [pendingAdDelete, setPendingAdDelete] = useState(null);
  const [isDeletingAd, setIsDeletingAd] = useState(false);

  // ── Handlers (moved from Treasury, logic unchanged) ──
  const handleSaveAd = async (event) => {
    event.preventDefault();
    if (!adMonth || !adShop || Number(adAmount) <= 0) return;
    if (adSource === 'SELF_FUNDED' && !adAccount) return;
    if (adSource === 'PERSONAL_ADVANCE' && !adAdvancedBy.trim()) return;

    setIsSavingAd(true);
    try {
      await addAd({
        month: adMonth,
        shop: adShop,
        amount: Number(adAmount),
        source: adSource,
        account: adSource === 'SELF_FUNDED' ? adAccount : null,
        advancedBy: adSource === 'PERSONAL_ADVANCE' ? adAdvancedBy.trim() : null,
        date: adSource !== 'DEDUCTED_FROM_REVENUE' ? adDate : null,
        note: adNote.trim() || null,
      });
      setAdAmount('');
      setAdNote('');
      toast.success(`Đã lưu chi phí quảng cáo ${adShop} tháng ${adMonth}.`);
    } catch (error) {
      toast.error(`Không thể lưu chi phí quảng cáo: ${error.message}`);
    } finally {
      setIsSavingAd(false);
    }
  };

  const openReimbursementForm = (advance) => {
    setRepayingAdvanceId(advance.id);
    setReimbursementAmount('');
    setReimbursementDate(new Date().toISOString().split('T')[0]);
    setReimbursementSource('TREASURY_ACCOUNT');
    setReimbursementAccount(accounts[0] || '');
    setReimbursementNote('');
  };

  const closeReimbursementForm = () => {
    setRepayingAdvanceId(null);
    setReimbursementAmount('');
    setReimbursementNote('');
  };

  const handleSaveReimbursement = async (event) => {
    event.preventDefault();
    const advance = advanceSummary.advances.find(item => item.id === repayingAdvanceId);
    const amountToReimburse = Number(reimbursementAmount);
    if (!advance || amountToReimburse <= 0 || amountToReimburse > advance.outstanding) {
      toast.error('Số tiền hoàn ứng không hợp lệ hoặc vượt quá công nợ còn lại.');
      return;
    }
    if (reimbursementSource === 'TREASURY_ACCOUNT' && !reimbursementAccount) return;

    setIsSavingReimbursement(true);
    try {
      await reimburseAdAdvance(advance.id, {
        amount: amountToReimburse,
        source: reimbursementSource,
        account: reimbursementSource === 'TREASURY_ACCOUNT' ? reimbursementAccount : null,
        date: reimbursementDate,
        note: reimbursementNote.trim() || null,
      });
      closeReimbursementForm();
      toast.success(`Đã hoàn ${formatCurrency(amountToReimburse)} cho ${advance.advancedBy || advance.shop}.`);
    } catch (error) {
      toast.error(`Không thể hoàn ứng: ${error.message}`);
    } finally {
      setIsSavingReimbursement(false);
    }
  };

  const confirmDeleteAd = async () => {
    if (!pendingAdDelete) return;
    setIsDeletingAd(true);
    try {
      await deleteAd(pendingAdDelete.id);
      toast.success(`Đã xóa chi phí quảng cáo ${pendingAdDelete.shop} tháng ${pendingAdDelete.month}.`);
      setPendingAdDelete(null);
    } catch (error) {
      toast.error(`Không thể xóa chi phí quảng cáo ${pendingAdDelete.shop}: ${error.message}`);
    } finally {
      setIsDeletingAd(false);
    }
  };

  // ── Computed data ──
  const advanceSummary = useMemo(() => calculateAdAdvanceSummary(ads), [ads]);

  const packagingComparison = useMemo(() => {
    const monthMap = {};
    (transactions || []).forEach(t => {
      if (t.type === 'CHI' && t.category === 'Mua vật liệu đóng gói') {
        const m = t.date?.slice(0, 7);
        if (!m) return;
        if (!monthMap[m]) monthMap[m] = { month: m, materialCost: 0, packagingFeeTotal: 0, orderCount: 0 };
        monthMap[m].materialCost += Number(t.amount) || 0;
      }
    });
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

      {/* ── Packaging comparison ── */}
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

      {/* ── Ad costs form + table (moved from Treasury, logic unchanged) ── */}
      <section className="card expenses-section treasury-ads" aria-labelledby="expenses-ads-title">
        <h2 id="expenses-ads-title" className="h3">Nhập Chi Phí Quảng Cáo</h2>
        <p className="expenses-section__description">
          Chi phí luôn được tính vào lợi nhuận. Chỉ nguồn chi trực tiếp từ quỹ mới trừ tài khoản ngay; cá nhân ứng trước sẽ tạo công nợ để hoàn lại sau.
        </p>
        <form onSubmit={handleSaveAd} className="treasury-form-grid treasury-form-grid--ads">
          <FormField label="Tháng"><input type="month" value={adMonth} onChange={e => setAdMonth(e.target.value)} required /></FormField>
          <FormField label="Shop"><input type="text" list="expenses-ad-shops" value={adShop} onChange={e => setAdShop(e.target.value)} placeholder="Chọn hoặc nhập shop..." required /></FormField>
          <FormField label="Chi phí (VND)"><input className="num" type="number" min="1" value={adAmount} onChange={e => setAdAmount(e.target.value)} required /></FormField>
          <FormField label="Nguồn thanh toán"><select value={adSource} onChange={e => setAdSource(e.target.value)}><option value="DEDUCTED_FROM_REVENUE">Shopee tự trừ trong đơn</option><option value="SHOPEE_WALLET">Nạp thủ công từ Ví Shopee</option><option value="SELF_FUNDED">Chi trực tiếp từ quỹ shop</option><option value="PERSONAL_ADVANCE">Cá nhân ứng trước (không trừ quỹ)</option></select></FormField>
          {adSource !== 'DEDUCTED_FROM_REVENUE' && <FormField label="Ngày chi"><input type="date" value={adDate} onChange={e => setAdDate(e.target.value)} required /></FormField>}
          {adSource === 'SELF_FUNDED' && <FormField label="Tài khoản quỹ chi"><select value={adAccount} onChange={e => setAdAccount(e.target.value)} required><option value="">Chọn tài khoản</option>{accounts.map(accountName => <option key={accountName} value={accountName}>{accountName}</option>)}</select></FormField>}
          {adSource === 'PERSONAL_ADVANCE' && <FormField label="Người ứng tiền"><input type="text" list="expenses-ad-advance-people" value={adAdvancedBy} onChange={e => setAdAdvancedBy(e.target.value)} placeholder="Chọn hoặc nhập tên..." required /></FormField>}
          <FormField label="Ghi chú" className="treasury-form-grid__wide"><input type="text" value={adNote} onChange={e => setAdNote(e.target.value)} placeholder="VD: QC Shopee tháng 7" /></FormField>
          {can('treasury', 'create') && <Button type="submit" loading={isSavingAd}>{isSavingAd ? 'Đang lưu...' : 'Lưu chi phí'}</Button>}
        </form>
        <datalist id="expenses-ad-shops">{shops.map(shopName => <option key={shopName} value={shopName} />)}</datalist>
        <datalist id="expenses-ad-advance-people">{partners.map(partner => <option key={partner.name} value={partner.name} />)}</datalist>
        {adSource === 'PERSONAL_ADVANCE' && <div className="surface-subtle treasury-source-note"><strong>Khoản này không trừ tài khoản quỹ.</strong> Hệ thống chỉ ghi nhận chi phí quảng cáo và công nợ phải hoàn cho người ứng.</div>}
        {adSource === 'SELF_FUNDED' && <div className="surface-subtle treasury-source-note"><strong>Khoản này sẽ trừ ngay tài khoản quỹ đã chọn</strong> và vẫn được tính là chi phí quảng cáo.</div>}
        {ads.length > 0 ? (<div className="table-responsive treasury-ads-table"><table className="table"><thead><tr><th>Tháng</th><th>Shop</th><th>Nguồn</th><th>Tài khoản / Người ứng</th><th>Số tiền</th><th>Ghi chú</th><th></th></tr></thead><tbody>{ads.map(ad => (<tr key={ad.id}><td>{ad.month}</td><td>{ad.shop}</td><td>{getAdSourceLabel(ad.source)}</td><td>{ad.source === 'PERSONAL_ADVANCE' ? ad.advancedBy : ad.account || '-'}</td><td className="num">{formatCurrency(ad.amount)}</td><td>{ad.note || '-'}</td><td>{can('treasury', 'delete') && <Button type="button" variant="danger-ghost" size="sm" icon={Trash2} iconOnly aria-label={`Xóa chi phí quảng cáo ${ad.shop} ${ad.month}`} onClick={() => setPendingAdDelete(ad)} />}</td></tr>))}</tbody></table></div>) : <EmptyState icon={Wallet} title="Chưa có chi phí quảng cáo" description="Chi phí đã lưu sẽ xuất hiện tại đây." />}

        {/* ── Advance tracking (moved from Treasury, logic unchanged) ── */}
        <div className="treasury-advance-section">
          <div className="treasury-advance-heading">
            <div>
              <h4>Công nợ tạm ứng quảng cáo</h4>
              <p>Theo dõi số cá nhân đã ứng, số đã hoàn và số shop còn phải trả.</p>
            </div>
            <Badge variant="warning">Còn phải trả {formatCurrency(advanceSummary.totalOutstanding)}</Badge>
          </div>

          <div className="table-responsive">
            <table className="table treasury-advance-table">
              <thead><tr><th>Người ứng</th><th>Ngày</th><th>Shop</th><th>Đã ứng</th><th>Đã hoàn</th><th>Còn phải trả</th><th>Trạng thái</th><th></th></tr></thead>
              <tbody>
                {advanceSummary.advances.length === 0 ? <tr><td colSpan="8" className="treasury-empty-cell"><EmptyState icon={Wallet} title="Chưa có khoản cá nhân ứng trước" description="Các khoản ứng quảng cáo sẽ được theo dõi tại đây." /></td></tr> : advanceSummary.advances.map(advance => (
                  <React.Fragment key={advance.id}>
                    <tr>
                      <td><strong>{advance.advancedBy || 'Chưa xác định'}</strong></td>
                      <td>{advance.date || `${advance.month}-01`}</td>
                      <td>{advance.shop}</td>
                      <td className="num">{formatCurrency(advance.amount)}</td>
                      <td className="num">{formatCurrency(advance.reimbursed)}</td>
                      <td className="num"><strong>{formatCurrency(advance.outstanding)}</strong></td>
                      <td><Badge variant={advance.status === 'PAID' ? 'success' : advance.status === 'PARTIAL' ? 'info' : 'warning'}>{advance.status === 'PAID' ? 'Đã hoàn đủ' : advance.status === 'PARTIAL' ? 'Hoàn một phần' : 'Chưa hoàn'}</Badge></td>
                      <td>{advance.outstanding > 0 && can('treasury', 'create') && <Button type="button" variant="secondary" size="sm" onClick={() => openReimbursementForm(advance)}>Hoàn ứng</Button>}</td>
                    </tr>
                    {repayingAdvanceId === advance.id && (
                      <tr className="treasury-reimbursement-row"><td colSpan="8">
                        <form className="treasury-reimbursement-form" onSubmit={handleSaveReimbursement}>
                          <FormField label="Số tiền trả lần này" helpText={`Còn nợ ${formatCurrency(advance.outstanding)}. Có thể nhập số tiền trả một phần.`}>
                            <input type="number" min="1" max={advance.outstanding} step="1" value={reimbursementAmount} onChange={event => setReimbursementAmount(event.target.value)} placeholder="Nhập số tiền muốn trả" required />
                          </FormField>
                          <FormField label="Ngày hoàn"><input type="date" value={reimbursementDate} onChange={event => setReimbursementDate(event.target.value)} required /></FormField>
                          <FormField label="Nguồn hoàn ứng"><select value={reimbursementSource} onChange={event => setReimbursementSource(event.target.value)}><option value="TREASURY_ACCOUNT">Từ tài khoản quỹ shop</option><option value="SHOPEE_WALLET">Trực tiếp từ Ví Shopee</option></select></FormField>
                          {reimbursementSource === 'TREASURY_ACCOUNT' && <FormField label="Tài khoản trả"><select value={reimbursementAccount} onChange={event => setReimbursementAccount(event.target.value)} required><option value="">Chọn tài khoản</option>{accounts.map(accountName => <option key={accountName} value={accountName}>{accountName}</option>)}</select></FormField>}
                          <FormField label="Ghi chú" className="treasury-reimbursement-note"><input type="text" value={reimbursementNote} onChange={event => setReimbursementNote(event.target.value)} placeholder="VD: Hoàn ứng QC tháng 7" /></FormField>
                          <div className="treasury-reimbursement-actions"><Button type="button" variant="secondary" onClick={() => setReimbursementAmount(String(advance.outstanding))}>Điền toàn bộ</Button><Button type="button" variant="secondary" onClick={closeReimbursementForm}>Hủy</Button>{can('treasury', 'create') && <Button type="submit" loading={isSavingReimbursement}>{isSavingReimbursement ? 'Đang lưu...' : 'Xác nhận hoàn ứng'}</Button>}</div>
                        </form>
                        <p className="treasury-reimbursement-help">Hoàn từ tài khoản quỹ sẽ trừ số dư tài khoản. Hoàn trực tiếp từ Ví Shopee chỉ trừ số dư ví sàn tạm tính.</p>
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(pendingAdDelete)}
        onClose={() => !isDeletingAd && setPendingAdDelete(null)}
        onConfirm={confirmDeleteAd}
        title="Xóa chi phí quảng cáo"
        itemName={pendingAdDelete ? `${pendingAdDelete.shop} tháng ${pendingAdDelete.month}` : undefined}
        description={pendingAdDelete ? `Xóa chi phí quảng cáo ${pendingAdDelete.shop} tháng ${pendingAdDelete.month}? Bút toán liên quan sẽ được cập nhật theo logic hiện tại.` : undefined}
        loading={isDeletingAd}
      />
    </div>
  );
}
