import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/appStoreContext';
import { calculateAdAdvanceSummary, calculateMarketplaceWalletSummary, calculateProfitAnalytics } from '../domain/profitAnalytics';
import { IconEdit as Edit, IconWallet as Wallet, IconArrowUpRight as ArrowUpRight, IconArrowDownRight as ArrowDownRight, IconArrowsExchange as ArrowRightLeft, IconPlus as Plus, IconTrash as Trash2, IconFilter as Filter, IconRefresh } from '@tabler/icons-react';
import { toast } from '../components/ui/toastHelper';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useAuth } from '../lib/AuthContext';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import FormField from '../components/ui/FormField';
import StatCard from '../components/ui/StatCard';

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
}

function getAdSourceLabel(source) {
  if (source === 'SELF_FUNDED') return 'Chi trực tiếp từ quỹ shop';
  if (source === 'PERSONAL_ADVANCE') return 'Cá nhân ứng trước';
  if (source === 'SHOPEE_WALLET') return 'Ví Shopee';
  return 'Shopee tự trừ trong đơn';
}

export default function Treasury() {
  const { transactions, addTransaction, updateTransaction, deleteTransaction, orders, losses, ads, addAd, reimburseAdAdvance, deleteAd, accounts, partners, shops, refresh, refreshing } = useAppStore();
  const { can } = useAuth();

  const [showForm, setShowForm] = useState(false);
  const [editingTxnId, setEditingTxnId] = useState(null);
  const entryFormRef = useRef(null);

  useEffect(() => {
    if (!showForm || !entryFormRef.current) return;
    entryFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showForm]);
  
  // Filters
  const [filterMonth, setFilterMonth] = useState('');
  const [filterType, setFilterType] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState('THU'); // THU, CHI, CHUYEN
  const [account, setAccount] = useState(accounts[0] || '');
  const [fromAccount, setFromAccount] = useState(accounts[0] || '');
  const [toAccount, setToAccount] = useState(accounts[1] || accounts[0] || '');
  const [category, setCategory] = useState('Rút tiền từ Sàn');
  const [shop, setShop] = useState(shops[0] || '');
  const [person, setPerson] = useState(partners.length > 0 ? partners[0].name : ''); 
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [withdrawalDate, setWithdrawalDate] = useState(new Date().toISOString().split('T')[0]);
  const [withdrawalShop, setWithdrawalShop] = useState('');
  const [withdrawalAccount, setWithdrawalAccount] = useState(accounts[0] || '');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalNote, setWithdrawalNote] = useState('');
  const [isSavingWithdrawal, setIsSavingWithdrawal] = useState(false);
  const [adMonth, setAdMonth] = useState('');
  const [adShop, setAdShop] = useState('');
  const [adAmount, setAdAmount] = useState('');
  const [adSource, setAdSource] = useState('DEDUCTED_FROM_REVENUE');
  const [adAccount, setAdAccount] = useState(accounts[0] || '');
  const [adAdvancedBy, setAdAdvancedBy] = useState(partners[0]?.name || '');
  const [adDate, setAdDate] = useState(new Date().toISOString().split('T')[0]);
  const [adNote, setAdNote] = useState('');
  const [isSavingAd, setIsSavingAd] = useState(false);
  const [repayingAdvanceId, setRepayingAdvanceId] = useState(null);
  const [reimbursementAmount, setReimbursementAmount] = useState('');
  const [reimbursementDate, setReimbursementDate] = useState(new Date().toISOString().split('T')[0]);
  const [reimbursementSource, setReimbursementSource] = useState('TREASURY_ACCOUNT');
  const [reimbursementAccount, setReimbursementAccount] = useState(accounts[0] || '');
  const [reimbursementNote, setReimbursementNote] = useState('');
  const [isSavingReimbursement, setIsSavingReimbursement] = useState(false);
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);
  const [pendingTransactionDelete, setPendingTransactionDelete] = useState(null);
  const [isDeletingTransaction, setIsDeletingTransaction] = useState(false);
  const [pendingAdDelete, setPendingAdDelete] = useState(null);
  const [isDeletingAd, setIsDeletingAd] = useState(false);

  const handleSaveWithdrawal = async (event) => {
    event.preventDefault();
    if (!withdrawalDate || !withdrawalShop || !withdrawalAccount || Number(withdrawalAmount) <= 0) return;

    setIsSavingWithdrawal(true);
    try {
      await addTransaction({
        date: withdrawalDate,
        type: 'THU',
        account: withdrawalAccount,
        category: 'Rút tiền từ Sàn',
        shop: withdrawalShop,
        amount: Number(withdrawalAmount),
        note: withdrawalNote.trim()
      });
      setWithdrawalAmount('');
      setWithdrawalNote('');
      toast.success(`Đã ghi nhận ${formatCurrency(withdrawalAmount)} từ ${withdrawalShop} về ${withdrawalAccount}.`);
    } catch (error) {
      toast.error(`Không thể lưu tiền rút về: ${error.message}`);
    } finally {
      setIsSavingWithdrawal(false);
    }
  };

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
    const advance = calculateAdAdvanceSummary(ads).advances.find(item => item.id === repayingAdvanceId);
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

  // 1. Calculate Balances dynamically based on accounts
  const balances = {};
  accounts.forEach(a => balances[a] = 0);

  const capital = {};
  partners.forEach(p => capital[p.name] = { contributed: 0, withdrawn: 0 });

  if (transactions && transactions.length > 0) {
    transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      
      if (t.type === 'THU') {
        if (balances[t.account] !== undefined) balances[t.account] += amt;
        if (t.category === 'Nhận vốn góp' && t.person && capital[t.person]) {
          capital[t.person].contributed += amt;
        }
      } else if (t.type === 'CHI') {
        if (balances[t.account] !== undefined) balances[t.account] -= amt;
        if (t.category === 'Rút vốn / Chia lợi nhuận' && t.person && capital[t.person]) {
          capital[t.person].withdrawn += amt;
        }
      } else if (t.type === 'CHUYEN') {
        if (balances[t.fromAccount] !== undefined) balances[t.fromAccount] -= amt;
        if (balances[t.toAccount] !== undefined) balances[t.toAccount] += amt;
      }
    });
  }

  const totalFund = Object.values(balances).reduce((sum, b) => sum + b, 0);

  const advanceSummary = useMemo(() => calculateAdAdvanceSummary(ads), [ads]);
  const projectedFundAfterReimbursement = totalFund - advanceSummary.totalOutstanding;

  const marketplaceWallets = useMemo(
    () => calculateMarketplaceWalletSummary(orders, transactions, ads, shops),
    [orders, transactions, ads, shops]
  );

  // Calculate profit share using partners configuration
  const profitData = useMemo(() => calculateProfitAnalytics(orders, losses, ads, partners), [orders, losses, ads, partners]);
  
  // Total profit pool generated across all months
  let totalCashProfit = 0;
  profitData.forEach(row => {
    if (row.isTotal) {
      totalCashProfit += row.cashMonthProfit;
    }
  });

  const capitalReport = partners.map(p => {
    const cap = capital[p.name];
    // This partner's share of the total profit
    const partnerProfitShare = totalCashProfit * (p.share / 100);
    const balance = cap.contributed + partnerProfitShare - cap.withdrawn;
    return {
      person: p.name,
      contributed: cap.contributed,
      profit: partnerProfitShare,
      withdrawn: cap.withdrawn,
      balance
    };
  });

  const transactionsWithBalance = useMemo(() => {
    const sortedTransactions = [...(transactions || [])].sort((a, b) => {
      const dateDiff = new Date(a.date) - new Date(b.date);
      if (dateDiff !== 0) return dateDiff;
      const createdDiff = new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      if (createdDiff !== 0) return createdDiff;
      return (a.id || '').localeCompare(b.id || '');
    });
    const runningBalances = Object.fromEntries(accounts.map(accountName => [accountName, 0]));

    return sortedTransactions.map(transaction => {
      const transactionAmount = Number(transaction.amount) || 0;
      const balancesBefore = { ...runningBalances };

      if (transaction.type === 'THU') {
        runningBalances[transaction.account] = (runningBalances[transaction.account] || 0) + transactionAmount;
      } else if (transaction.type === 'CHI') {
        runningBalances[transaction.account] = (runningBalances[transaction.account] || 0) - transactionAmount;
      } else if (transaction.type === 'CHUYEN') {
        runningBalances[transaction.fromAccount] = (runningBalances[transaction.fromAccount] || 0) - transactionAmount;
        runningBalances[transaction.toAccount] = (runningBalances[transaction.toAccount] || 0) + transactionAmount;
      }

      return {
        ...transaction,
        balancesBefore,
        balancesAfter: { ...runningBalances },
      };
    });
  }, [transactions, accounts]);

  const visibleAccountHistories = useMemo(() => {
    return accounts.map(accountName => ({
      account: accountName,
      transactions: transactionsWithBalance
        .filter(transaction => !filterMonth || transaction.date.startsWith(filterMonth))
        .filter(transaction => !filterType || transaction.type === filterType)
        .filter(transaction => (
          transaction.account === accountName
          || transaction.fromAccount === accountName
          || transaction.toAccount === accountName
        ))
        .reverse(),
    }));
  }, [accounts, filterMonth, filterType, transactionsWithBalance]);

  const handleSave = async () => {
    if (!amount || Number(amount) <= 0) {
      toast.error('Vui lòng nhập số tiền hợp lệ.');
      return;
    }
    const newTxn = {
      id: 'TXN-' + Date.now(),
      date,
      type,
      amount: Number(amount),
      note
    };
    if (type === 'CHUYEN') {
      if (fromAccount === toAccount) {
        toast.error('Tài khoản gửi và nhận phải khác nhau.');
        return;
      }
      newTxn.fromAccount = fromAccount;
      newTxn.toAccount = toAccount;
    } else {
      newTxn.account = account;
      newTxn.category = category;
      if (category === 'Rút tiền từ Sàn') newTxn.shop = shop;
      if (category === 'Nhận vốn góp' || category === 'Rút vốn / Chia lợi nhuận') {
        newTxn.person = person;
      }
    }

    setIsSavingTransaction(true);
    try {
      if (editingTxnId) {
        await updateTransaction(editingTxnId, newTxn);
      } else {
        await addTransaction(newTxn);
      }

      toast.success(editingTxnId ? `Đã cập nhật giao dịch ${editingTxnId}.` : `Đã lưu giao dịch ${newTxn.id}.`);
      setShowForm(false);
      setEditingTxnId(null);
      setAmount('');
      setNote('');
    } catch (error) {
      toast.error(`Không thể lưu giao dịch: ${error.message}`);
    } finally {
      setIsSavingTransaction(false);
    }
  };

  const handleEdit = (t) => {
    setEditingTxnId(t.id);
    setDate(t.date);
    setType(t.type);
    if (t.type === 'CHUYEN') {
      setFromAccount(t.fromAccount || accounts[0]);
      setToAccount(t.toAccount || accounts[1]);
    } else {
      setAccount(t.account || accounts[0]);
      setCategory(t.category || '');
      setPerson(t.person || '');
    }
    setAmount(t.amount);
    setNote(t.note || '');
    setShop(t.shop || shops[0] || '');
    setShowForm(true);
  };
  
  const handleCancelEdit = () => {
    setShowForm(false);
    setEditingTxnId(null);
    setAmount('');
    setNote('');
  };

  const handleDeleteTransaction = (transaction) => {
    setPendingTransactionDelete(transaction);
  };

  const confirmDeleteTransaction = async () => {
    if (!pendingTransactionDelete) return;

    setIsDeletingTransaction(true);
    try {
      await deleteTransaction(pendingTransactionDelete.id);
      toast.success(`Đã xóa giao dịch ${pendingTransactionDelete.id}.`);
      setPendingTransactionDelete(null);
    } catch (error) {
      toast.error(`Không thể xóa giao dịch: ${error.message}`);
    } finally {
      setIsDeletingTransaction(false);
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

  const getCategoryOptions = () => {
    if (type === 'THU') return ['Rút tiền từ Sàn', 'Nhận vốn góp', 'Thu khác'];
    if (type === 'CHI') return ['Tiền nhập hàng', 'Mua vật liệu đóng gói', 'Tiền quảng cáo (Ads)', 'Rút vốn / Chia lợi nhuận', 'Chi phí khác'];
    return [];
  };

  return (
    <div className="animate-fade-in treasury-page">
      <PageHeader
        title="Sổ Quỹ & Dòng Tiền"
        description="Quản lý tiền mặt tại tài khoản ngân hàng và Vốn góp"
        actions={
          <div className="header-actions">
            <Button variant="secondary" icon={IconRefresh} loading={refreshing} onClick={() => refresh().catch(() => toast.error('Không thể làm mới dữ liệu'))}>Làm mới</Button>
            {can('treasury', 'create') && <Button icon={Plus} onClick={() => setShowForm(!showForm)}>Thêm Giao Dịch</Button>}
          </div>
        }
      />

      <div className="treasury-balances">
        {accounts.map((acc, idx) => {
          return (
            <StatCard key={acc} className={`treasury-balance-card treasury-tone-${idx % 6} ${balances[acc] < 0 ? 'is-negative' : ''}`} label={acc} value={formatCurrency(balances[acc])} icon={Wallet} description="Số dư tài khoản" />
          );
        })}
        <StatCard className={`treasury-balance-card treasury-tone-0 ${totalFund < 0 ? 'is-negative' : ''}`} label="TỔNG QUỸ CHUNG" value={formatCurrency(totalFund)} icon={Wallet} description="Tổng số dư các tài khoản" />
        <StatCard className="treasury-balance-card treasury-tone-3 is-negative" label="CÔNG NỢ CÁ NHÂN ỨNG TRƯỚC" value={formatCurrency(advanceSummary.totalOutstanding)} icon={ArrowUpRight} description="Shop còn phải hoàn lại" />
        <StatCard className={`treasury-balance-card treasury-tone-1 ${projectedFundAfterReimbursement < 0 ? 'is-negative' : ''}`} label="QUỸ SAU KHI HOÀN HẾT ỨNG" value={formatCurrency(projectedFundAfterReimbursement)} icon={Wallet} description="Số dự kiến, chưa trừ quỹ hiện tại" />
      </div>

      <section className="card treasury-section treasury-wallet" aria-labelledby="treasury-wallet-title">
        <h2 id="treasury-wallet-title" className="h3">Ví Sàn Theo Shop</h2>
        <p className="treasury-section__description">
          Sàn đã thanh toán lấy theo ngày hoàn tất thanh toán của từng đơn. Tiền rút về chỉ là chuyển từ ví sàn sang tài khoản nhận, không tạo thêm doanh thu.
        </p>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Shop</th>
                <th>Sàn đã thanh toán</th>
                <th>Đã rút về</th>
                <th>Nạp QC từ Ví Shopee</th>
                <th>Hoàn ứng từ ví sàn</th>
                <th>Số dư ví sàn tạm tính</th>
              </tr>
            </thead>
            <tbody>
              {marketplaceWallets.length === 0 ? (
                <tr>
                  <td colSpan="6" className="treasury-empty-cell">
                    <EmptyState icon={Wallet} title="Chưa có dữ liệu ví sàn" description="Cấu hình shop hoặc ghi nhận đơn đã thanh toán để theo dõi số dư ví." />
                  </td>
                </tr>
              ) : marketplaceWallets.map(wallet => (
                <tr key={wallet.shop}>
                  <td className="treasury-name-cell">{wallet.shop}</td>
                  <td className="num treasury-value--income">{formatCurrency(wallet.settledRevenue)}</td>
                  <td className="num treasury-value--info">{formatCurrency(wallet.withdrawn)}</td>
                  <td className="num treasury-value--expense">{formatCurrency(wallet.walletAdSpend)}</td>
                  <td className="num treasury-value--expense">{formatCurrency(wallet.advanceReimbursements)}</td>
                  <td className={`num treasury-value--strong ${wallet.estimatedBalance < 0 ? 'treasury-value--expense' : 'treasury-value--primary'}`}>
                    {formatCurrency(wallet.estimatedBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="treasury-section__warning">
          Số dư tạm tính chưa bao gồm số dư ví sàn đã có trước khi dữ liệu được nhập vào ứng dụng.
        </p>
      </section>

      <section className="card treasury-section treasury-withdrawal" aria-labelledby="treasury-withdrawal-title">
        <h2 id="treasury-withdrawal-title" className="h3">Nhập Tiền Rút Về Tài Khoản</h2>
        <p className="treasury-section__description">
          Ghi nhận tiền chuyển từ ví sàn về tài khoản nhận; khoản này không cộng lại vào doanh thu hoặc lợi nhuận.
        </p>
        <form onSubmit={handleSaveWithdrawal} className="treasury-form-grid">
          <FormField label="Ngày rút"><input type="date" value={withdrawalDate} onChange={e => setWithdrawalDate(e.target.value)} required /></FormField>
          <FormField label="Shop"><select value={withdrawalShop} onChange={e => setWithdrawalShop(e.target.value)} required><option value="">Chọn shop</option>{shops.map(shopName => <option key={shopName} value={shopName}>{shopName}</option>)}</select></FormField>
          <FormField label="Tài khoản nhận"><select value={withdrawalAccount} onChange={e => setWithdrawalAccount(e.target.value)} required><option value="">Chọn tài khoản</option>{accounts.map(accountName => <option key={accountName} value={accountName}>{accountName}</option>)}</select></FormField>
          <FormField label="Số tiền (VND)"><input className="num" type="number" min="1" value={withdrawalAmount} onChange={e => setWithdrawalAmount(e.target.value)} required /></FormField>
          <FormField label="Ghi chú" className="treasury-form-grid__wide"><input type="text" value={withdrawalNote} onChange={e => setWithdrawalNote(e.target.value)} placeholder="VD: Rút tiền Shopee tuần 2" /></FormField>
          {can('treasury', 'create') && <Button type="submit" loading={isSavingWithdrawal}>{isSavingWithdrawal ? 'Đang lưu...' : 'Ghi nhận tiền về'}</Button>}
        </form>
      </section>

      <section className="card treasury-section treasury-ads" aria-labelledby="treasury-ads-title">
        <h2 id="treasury-ads-title" className="h3">Nhập Chi Phí Quảng Cáo</h2>
        <p className="treasury-section__description">
          Chi phí luôn được tính vào lợi nhuận. Chỉ nguồn chi trực tiếp từ quỹ mới trừ tài khoản ngay; cá nhân ứng trước sẽ tạo công nợ để hoàn lại sau.
        </p>
        <form onSubmit={handleSaveAd} className="treasury-form-grid treasury-form-grid--ads">
          <FormField label="Tháng"><input type="month" value={adMonth} onChange={e => setAdMonth(e.target.value)} required /></FormField>
          <FormField label="Shop"><input type="text" list="treasury-ad-shops" value={adShop} onChange={e => setAdShop(e.target.value)} placeholder="Chọn hoặc nhập shop..." required /></FormField>
          <FormField label="Chi phí (VND)"><input className="num" type="number" min="1" value={adAmount} onChange={e => setAdAmount(e.target.value)} required /></FormField>
          <FormField label="Nguồn thanh toán"><select value={adSource} onChange={e => setAdSource(e.target.value)}><option value="DEDUCTED_FROM_REVENUE">Shopee tự trừ trong đơn</option><option value="SHOPEE_WALLET">Nạp thủ công từ Ví Shopee</option><option value="SELF_FUNDED">Chi trực tiếp từ quỹ shop</option><option value="PERSONAL_ADVANCE">Cá nhân ứng trước (không trừ quỹ)</option></select></FormField>
          {adSource !== 'DEDUCTED_FROM_REVENUE' && <FormField label="Ngày chi"><input type="date" value={adDate} onChange={e => setAdDate(e.target.value)} required /></FormField>}
          {adSource === 'SELF_FUNDED' && <FormField label="Tài khoản quỹ chi"><select value={adAccount} onChange={e => setAdAccount(e.target.value)} required><option value="">Chọn tài khoản</option>{accounts.map(accountName => <option key={accountName} value={accountName}>{accountName}</option>)}</select></FormField>}
          {adSource === 'PERSONAL_ADVANCE' && <FormField label="Người ứng tiền"><input type="text" list="treasury-ad-advance-people" value={adAdvancedBy} onChange={e => setAdAdvancedBy(e.target.value)} placeholder="Chọn hoặc nhập tên..." required /></FormField>}
          <FormField label="Ghi chú" className="treasury-form-grid__wide"><input type="text" value={adNote} onChange={e => setAdNote(e.target.value)} placeholder="VD: QC Shopee tháng 7" /></FormField>
          {can('treasury', 'create') && <Button type="submit" loading={isSavingAd}>{isSavingAd ? 'Đang lưu...' : 'Lưu chi phí'}</Button>}
        </form>
        <datalist id="treasury-ad-shops">{shops.map(shopName => <option key={shopName} value={shopName} />)}</datalist>
        <datalist id="treasury-ad-advance-people">{partners.map(partner => <option key={partner.name} value={partner.name} />)}</datalist>
        {adSource === 'PERSONAL_ADVANCE' && <div className="surface-subtle treasury-source-note"><strong>Khoản này không trừ tài khoản quỹ.</strong> Hệ thống chỉ ghi nhận chi phí quảng cáo và công nợ phải hoàn cho người ứng.</div>}
        {adSource === 'SELF_FUNDED' && <div className="surface-subtle treasury-source-note"><strong>Khoản này sẽ trừ ngay tài khoản quỹ đã chọn</strong> và vẫn được tính là chi phí quảng cáo.</div>}
        {ads.length > 0 ? (<div className="table-responsive treasury-ads-table"><table className="table"><thead><tr><th>Tháng</th><th>Shop</th><th>Nguồn</th><th>Tài khoản / Người ứng</th><th>Số tiền</th><th>Ghi chú</th><th></th></tr></thead><tbody>{ads.map(ad => (<tr key={ad.id}><td>{ad.month}</td><td>{ad.shop}</td><td>{getAdSourceLabel(ad.source)}</td><td>{ad.source === 'PERSONAL_ADVANCE' ? ad.advancedBy : ad.account || '-'}</td><td className="num">{formatCurrency(ad.amount)}</td><td>{ad.note || '-'}</td><td>{can('treasury', 'delete') && <Button type="button" variant="danger-ghost" size="sm" icon={Trash2} iconOnly aria-label={`Xóa chi phí quảng cáo ${ad.shop} ${ad.month}`} onClick={() => setPendingAdDelete(ad)} />}</td></tr>))}</tbody></table></div>) : <EmptyState icon={Wallet} title="Chưa có chi phí quảng cáo" description="Chi phí đã lưu sẽ xuất hiện tại đây." />}

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
                            <input
                              type="number"
                              min="1"
                              max={advance.outstanding}
                              step="1"
                              value={reimbursementAmount}
                              onChange={event => setReimbursementAmount(event.target.value)}
                              placeholder="Nhập số tiền muốn trả"
                              required
                            />
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

      {showForm && (
        <section ref={entryFormRef} className="card animate-fade-in treasury-entry-form" aria-labelledby="treasury-entry-title">
          <h2 id="treasury-entry-title" className="h3 treasury-entry-form__title">{editingTxnId ? 'Sửa Giao Dịch' : 'Ghi Nhận Dòng Tiền Mới'}</h2>
          <div className="treasury-entry-grid">
            <FormField label="Loại Giao Dịch">
              <select value={type} onChange={e => { setType(e.target.value); setCategory(e.target.value === 'THU' ? 'Rút tiền từ Sàn' : 'Tiền nhập hàng'); }}>
                <option value="THU">Thu tiền</option>
                <option value="CHI">Chi tiền</option>
                <option value="CHUYEN">Chuyển nội bộ</option>
              </select>
            </FormField>
            <FormField label="Ngày"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></FormField>
            
            {type !== 'CHUYEN' ? (
              <>
                <FormField label="Tài khoản">
                  <select value={account} onChange={e => setAccount(e.target.value)}>
                    {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </FormField>
                <FormField label="Hạng mục">
                  <select value={category} onChange={e => setCategory(e.target.value)}>
                    {getCategoryOptions().map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </FormField>
                {(category === 'Nhận vốn góp' || category === 'Rút vốn / Chia lợi nhuận') && (
                  <FormField label="Thành viên">
                    <select value={person} onChange={e => setPerson(e.target.value)}>
                      {partners.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                    </select>
                  </FormField>
                )}
                {category === 'Rút tiền từ Sàn' && (
                  <FormField label="Shop">
                    <select value={shop} onChange={e => setShop(e.target.value)}>
                      {shops.map(shopName => <option key={shopName} value={shopName}>{shopName}</option>)}
                    </select>
                  </FormField>
                )}
              </>
            ) : (
              <>
                <FormField label="Từ Tài Khoản">
                  <select value={fromAccount} onChange={e => setFromAccount(e.target.value)}>
                    {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </FormField>
                <FormField label="Đến Tài Khoản">
                  <select value={toAccount} onChange={e => setToAccount(e.target.value)}>
                    {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </FormField>
              </>
            )}
            
            <FormField label="Số tiền (VNĐ)"><input className="num" type="number" step="1000" value={amount} onChange={e => setAmount(e.target.value)} /></FormField>
            <FormField label="Ghi chú" className="treasury-entry-grid__wide"><input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Nhập ghi chú chi tiết..." /></FormField>
          </div>
          <div className="treasury-entry-actions">
            <Button variant="secondary" onClick={handleCancelEdit}>Hủy</Button>
            {can('treasury', editingTxnId ? 'update' : 'create') && <Button loading={isSavingTransaction} onClick={handleSave}>{isSavingTransaction ? 'Đang lưu...' : editingTxnId ? 'Lưu Thay Đổi' : 'Lưu Giao Dịch'}</Button>}
          </div>
        </section>
      )}

      <div className="treasury-lower-sections">
        <div className="card treasury-capital">
          <h2 className="h3 treasury-section-title">Báo Cáo Vốn & Cổ Tức</h2>
          <p className="treasury-section__description">
            Lợi nhuận được chia theo tỷ lệ cấu hình trong phần Cài Đặt.<br/>
            <strong>Tồn đọng (Nợ) = Vốn góp + Lãi lũy kế - Đã rút</strong>
          </p>
          <div className="table-responsive">
            <table className="table treasury-capital-table">
              <thead>
                <tr>
                  <th>Thành viên</th>
                  <th>Vốn góp</th>
                  <th>Lãi Lũy Kế</th>
                  <th>Đã rút</th>
                  <th>Tồn đọng (Nợ)</th>
                </tr>
            </thead>
            <tbody>
                {capitalReport.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="treasury-empty-cell">
                      <EmptyState icon={Wallet} title="Chưa có dữ liệu vốn góp" description="Thêm thành viên trong Cài Đặt để xem báo cáo vốn và cổ tức." />
                    </td>
                  </tr>
                ) : capitalReport.map(r => (
                  <tr key={r.person}>
                    <td className="treasury-name-cell">{r.person}</td>
                    <td className="num treasury-value--income">+{formatCurrency(r.contributed)}</td>
                    <td className="num treasury-value--income">+{formatCurrency(r.profit)}</td>
                    <td className="num treasury-value--expense">-{formatCurrency(r.withdrawn)}</td>
                    <td className={`num treasury-value--strong ${r.balance < 0 ? 'treasury-value--expense' : 'treasury-value--primary'}`}>
                      {formatCurrency(r.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card treasury-history">
          <div className="treasury-history-heading">
            <h2 className="h3">Lịch Sử Giao Dịch</h2>
            <div className="treasury-history-filters">
              <Filter size={16} aria-hidden="true" />
              <input 
                aria-label="Lọc theo tháng"
                type="month" 
                value={filterMonth} 
                onChange={e => setFilterMonth(e.target.value)} 
              />
              <select
                aria-label="Lọc theo loại giao dịch"
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
              >
                <option value="">Tất cả Thu / Chi</option>
                <option value="THU">Thu</option>
                <option value="CHI">Chi</option>
                <option value="CHUYEN">Chuyển nội bộ</option>
              </select>
            </div>
          </div>
          
          {visibleAccountHistories.length === 0 ? (
            <EmptyState icon={Wallet} title="Chưa có tài khoản để hiển thị lịch sử" description="Thêm tài khoản hoặc quỹ trong Cài Đặt để bắt đầu ghi nhận dòng tiền." />
          ) : (
            <div className="treasury-history-grid">
              {visibleAccountHistories.map(({ account: accountName, transactions: accountTransactions }, accountIndex) => (
              <section key={accountName} className={`treasury-account-history treasury-tone-${accountIndex % 6}`}>
                <div className="treasury-account-history__header">
                  <div className="treasury-account-history__name">
                    <Wallet size={20} />
                    <strong>Tài khoản: {accountName}</strong>
                  </div>
                  <div className="treasury-account-history__balance">
                    <span>Số dư hiện tại</span>
                    <strong className={`num ${balances[accountName] < 0 ? 'treasury-value--expense' : ''}`}>{formatCurrency(balances[accountName])}</strong>
                  </div>
                </div>
                <div className="table-responsive treasury-history-scroll">
                  <table className="table treasury-history-table">
                    <thead>
                      <tr>
                        <th>Ngày</th>
                        <th>Loại</th>
                        <th>Nội dung</th>
                        <th>Số tiền</th>
                        <th>Số dư tài khoản</th>
                        <th className="treasury-actions-column"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountTransactions.length === 0 ? (
                        <tr><td colSpan="6" className="treasury-empty-cell"><EmptyState icon={Wallet} title="Không tìm thấy giao dịch" description="Thử thay đổi bộ lọc tháng hoặc loại giao dịch." /></td></tr>
                      ) : accountTransactions.map(transaction => {
                        const isTransferOut = transaction.type === 'CHUYEN' && transaction.fromAccount === accountName;
                        const isTransferIn = transaction.type === 'CHUYEN' && transaction.toAccount === accountName;
                        const isExpense = transaction.type === 'CHI' || isTransferOut;
                        const isIncome = transaction.type === 'THU' || isTransferIn;
                        const accountBefore = transaction.balancesBefore[accountName] || 0;
                        const accountAfter = transaction.balancesAfter[accountName] || 0;

                        return (
                          <tr key={transaction.id}>
                            <td>{transaction.date}</td>
                            <td>
                              {transaction.type === 'THU' && <Badge variant="success"><ArrowDownRight size={16} /> Thu</Badge>}
                              {transaction.type === 'CHI' && <Badge variant="danger"><ArrowUpRight size={16} /> Chi</Badge>}
                              {transaction.type === 'CHUYEN' && <Badge variant={isTransferOut ? 'danger' : 'success'}><ArrowRightLeft size={16} /> {isTransferOut ? 'Chuyển đi' : 'Nhận chuyển'}</Badge>}
                            </td>
                            <td className="treasury-transaction-content">
                              <div className="treasury-transaction-content__title">
                                {transaction.type === 'CHUYEN' ? `${transaction.fromAccount} → ${transaction.toAccount}` : transaction.category}
                              </div>
                              {(transaction.person || transaction.shop || transaction.note) && (
                                <div className="treasury-transaction-content__meta">
                                  {transaction.person && <span>{transaction.person} · </span>}
                                  {transaction.shop && <span>{transaction.shop} · </span>}
                                  {transaction.note}
                                </div>
                              )}
                            </td>
                            <td>
                              <div className={`num treasury-transaction-amount ${isExpense ? 'treasury-value--expense' : (isIncome ? 'treasury-value--income' : '')}`}>
                                {isExpense ? '-' : (isIncome ? '+' : '')}{formatCurrency(transaction.amount)}
                              </div>
                            </td>
                            <td className="treasury-balance-change">
                              <div className="num">Trước: {formatCurrency(accountBefore)}</div>
                              <strong className={`num ${accountAfter < 0 ? 'treasury-value--expense' : 'treasury-value--primary'}`}>Sau: {formatCurrency(accountAfter)}</strong>
                            </td>
                            <td>
                              <div className="treasury-row-actions">
                                {can('treasury', 'update') && <Button variant="ghost" size="sm" icon={Edit} iconOnly aria-label={`Sửa giao dịch ${transaction.id}`} onClick={() => handleEdit(transaction)} />}
                                {can('treasury', 'delete') && <Button variant="danger-ghost" size="sm" icon={Trash2} iconOnly aria-label={`Xóa giao dịch ${transaction.id}`} onClick={() => handleDeleteTransaction(transaction)} />}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
              ))}
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(pendingAdDelete)}
        onClose={() => !isDeletingAd && setPendingAdDelete(null)}
        onConfirm={confirmDeleteAd}
        title="Xóa chi phí quảng cáo"
        itemName={pendingAdDelete ? `${pendingAdDelete.shop} tháng ${pendingAdDelete.month}` : undefined}
        description={pendingAdDelete ? `Xóa chi phí quảng cáo ${pendingAdDelete.shop} tháng ${pendingAdDelete.month}? Bút toán liên quan sẽ được cập nhật theo logic hiện tại.` : undefined}
        loading={isDeletingAd}
      />
      <ConfirmDialog
        open={Boolean(pendingTransactionDelete)}
        onClose={() => !isDeletingTransaction && setPendingTransactionDelete(null)}
        onConfirm={confirmDeleteTransaction}
        title="Xóa giao dịch"
        itemName={pendingTransactionDelete?.id}
        description={pendingTransactionDelete ? `Xóa giao dịch ${pendingTransactionDelete.id}? Thao tác này không thể hoàn tác.` : undefined}
        loading={isDeletingTransaction}
      />
    </div>
  );
}
