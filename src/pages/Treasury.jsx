import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/appStoreContext';
import { calculateAdAdvanceSummary } from '../domain/profitAnalytics';
import { IconEdit as Edit, IconWallet as Wallet, IconArrowUpRight as ArrowUpRight, IconArrowDownRight as ArrowDownRight, IconArrowsExchange as ArrowRightLeft, IconPlus as Plus, IconTrash as Trash2, IconFilter as Filter, IconRefresh } from '@tabler/icons-react';
import { toast } from '../components/ui/toastHelper';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useAuth } from '../lib/AuthContext';
import PageHeader from '../components/ui/PageHeader';
import HistoryRangeControl from '../components/HistoryRangeControl';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import FormField from '../components/ui/FormField';
import StatCard from '../components/ui/StatCard';

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
}

export default function Treasury() {
  const { transactions, addTransaction, updateTransaction, deleteTransaction, ads, accounts, partners, shops, refresh, refreshing, treasurySummary } = useAppStore();
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
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);
  const [pendingTransactionDelete, setPendingTransactionDelete] = useState(null);
  const [isDeletingTransaction, setIsDeletingTransaction] = useState(false);



  // Snapshot backend giữ số dư toàn kỳ chính xác dù trình duyệt chỉ tải lịch sử theo kỳ.
  const balances = treasurySummary?.balances || Object.fromEntries(accounts.map(name => [name, 0]));
  const capital = treasurySummary?.capital || Object.fromEntries(partners.map(partner => [partner.name, { contributed: 0, withdrawn: 0 }]));
  const totalFund = Object.values(balances).reduce((sum, balance) => sum + balance, 0);

  const advanceSummary = useMemo(() => calculateAdAdvanceSummary(ads), [ads]);
  const projectedFundAfterReimbursement = totalFund - advanceSummary.totalOutstanding;

  const marketplaceWallets = treasurySummary?.marketplaceWallets || [];
  const totalCashProfit = treasurySummary?.totalCashProfit || 0;

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
    const runningBalances = Object.fromEntries(accounts.map(accountName => [accountName, treasurySummary?.openingBalances?.[accountName] || 0]));

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
  }, [transactions, accounts, treasurySummary]);

  const visibleAccountHistories = useMemo(() => {
    const mapped = accounts.map(accountName => ({
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

    // Đảm bảo TK Châu nằm ở cuối cùng vì ít dùng
    return mapped.sort((a, b) => {
      const aIsChau = a.account.toLowerCase().includes('châu');
      const bIsChau = b.account.toLowerCase().includes('châu');
      if (aIsChau && !bIsChau) return 1;
      if (!aIsChau && bIsChau) return -1;
      return 0;
    });
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
      <HistoryRangeControl />

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
              {visibleAccountHistories.map(({ account: accountName, transactions: accountTransactions }, accountIndex) => {
                const isChau = accountName.toLowerCase().includes('châu');
                return (
              <section key={accountName} className={`treasury-account-history treasury-tone-${accountIndex % 6} ${isChau ? 'treasury-account-full-width' : ''}`}>
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
              );
            })}
            </div>
          )}
        </div>
      </div>

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
