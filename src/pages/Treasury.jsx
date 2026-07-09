import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStoreContext';
import { calculateProfitAnalytics } from '../domain/profitAnalytics';
import { Edit, Wallet, ArrowUpRight, ArrowDownRight, ArrowRightLeft, Plus, Trash2, Filter } from 'lucide-react';

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
}

export default function Treasury() {
  const { transactions, addTransaction, updateTransaction, deleteTransaction, orders, losses, ads, accounts, partners } = useAppStore();

  const [showForm, setShowForm] = useState(false);
  const [editingTxnId, setEditingTxnId] = useState(null);
  
  // Filters
  const [filterMonth, setFilterMonth] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState('THU'); // THU, CHI, CHUYEN
  const [account, setAccount] = useState(accounts[0] || '');
  const [fromAccount, setFromAccount] = useState(accounts[0] || '');
  const [toAccount, setToAccount] = useState(accounts[1] || accounts[0] || '');
  const [category, setCategory] = useState('Rút tiền từ Sàn');
  const [person, setPerson] = useState(partners.length > 0 ? partners[0].name : ''); 
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

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

  const handleSave = () => {
    if (!amount || Number(amount) <= 0) {
      alert('Vui lòng nhập số tiền hợp lệ.');
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
        alert('Tài khoản gửi và nhận phải khác nhau.');
        return;
      }
      newTxn.fromAccount = fromAccount;
      newTxn.toAccount = toAccount;
    } else {
      newTxn.account = account;
      newTxn.category = category;
      if (category === 'Nhận vốn góp' || category === 'Rút vốn / Chia lợi nhuận') {
        newTxn.person = person;
      }
    }

    if (editingTxnId) {
      updateTransaction(editingTxnId, newTxn);
    } else {
      addTransaction(newTxn);
    }
    
    setShowForm(false);
    setEditingTxnId(null);
    setAmount('');
    setNote('');
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
    setShowForm(true);
  };
  
  const handleCancelEdit = () => {
    setShowForm(false);
    setEditingTxnId(null);
    setAmount('');
    setNote('');
  };

  const getCategoryOptions = () => {
    if (type === 'THU') return ['Rút tiền từ Sàn', 'Nhận vốn góp', 'Thu khác'];
    if (type === 'CHI') return ['Tiền nhập hàng', 'Tiền quảng cáo (Ads)', 'Rút vốn / Chia lợi nhuận', 'Chi phí khác'];
    return [];
  };

  // Colors for dynamic cards
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#14b8a6', '#8b5cf6', '#ef4444'];
  const bgColors = ['#eff6ff', '#ecfdf5', '#fef3c7', '#ccfbf1', '#ede9fe', '#fef2f2'];

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Sổ Quỹ & Dòng Tiền</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Quản lý tiền mặt tại tài khoản ngân hàng và Vốn góp</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={18} /> Thêm Giao Dịch
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {accounts.map((acc, idx) => {
          const color = colors[idx % colors.length];
          const bg = bgColors[idx % bgColors.length];
          return (
            <div key={acc} className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: `4px solid ${color}` }}>
              <div style={{ background: bg, padding: '1rem', borderRadius: '50%', color: color }}>
                <Wallet size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>{acc}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: balances[acc] < 0 ? 'var(--color-danger)' : 'var(--color-text-base)' }}>
                  {formatCurrency(balances[acc])}
                </div>
              </div>
            </div>
          );
        })}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid #6366f1' }}>
          <div style={{ background: '#e0e7ff', padding: '1rem', borderRadius: '50%', color: '#6366f1' }}>
            <Wallet size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>TỔNG QUỸ CHUNG</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: totalFund < 0 ? 'var(--color-danger)' : 'var(--color-text-base)' }}>
              {formatCurrency(totalFund)}
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="card animate-fade-in" style={{ marginBottom: '2rem', border: '1px solid var(--color-primary)' }}>
          <h3 style={{ marginBottom: '1.5rem' }}>{editingTxnId ? 'Sửa Giao Dịch' : 'Ghi Nhận Dòng Tiền Mới'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={labelStyle}>Loại Giao Dịch</label>
              <select value={type} onChange={e => { setType(e.target.value); setCategory(e.target.value === 'THU' ? 'Rút tiền từ Sàn' : 'Tiền nhập hàng'); }} style={inputStyle}>
                <option value="THU">Thu tiền</option>
                <option value="CHI">Chi tiền</option>
                <option value="CHUYEN">Chuyển nội bộ</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Ngày</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </div>
            
            {type !== 'CHUYEN' ? (
              <>
                <div>
                  <label style={labelStyle}>Tài khoản</label>
                  <select value={account} onChange={e => setAccount(e.target.value)} style={inputStyle}>
                    {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Hạng mục</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
                    {getCategoryOptions().map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {(category === 'Nhận vốn góp' || category === 'Rút vốn / Chia lợi nhuận') && (
                  <div>
                    <label style={labelStyle}>Thành viên</label>
                    <select value={person} onChange={e => setPerson(e.target.value)} style={inputStyle}>
                      {partners.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                    </select>
                  </div>
                )}
              </>
            ) : (
              <>
                <div>
                  <label style={labelStyle}>Từ Tài Khoản</label>
                  <select value={fromAccount} onChange={e => setFromAccount(e.target.value)} style={inputStyle}>
                    {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Đến Tài Khoản</label>
                  <select value={toAccount} onChange={e => setToAccount(e.target.value)} style={inputStyle}>
                    {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </>
            )}
            
            <div>
              <label style={labelStyle}>Số tiền (VNĐ)</label>
              <input type="number" step="1000" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Ghi chú</label>
              <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Nhập ghi chú chi tiết..." style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-outline" onClick={handleCancelEdit}>Hủy</button>
            <button className="btn btn-primary" onClick={handleSave}>{editingTxnId ? 'Lưu Thay Đổi' : 'Lưu Giao Dịch'}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Báo Cáo Vốn & Cổ Tức</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
            Lợi nhuận được chia theo tỷ lệ cấu hình trong phần Cài Đặt.<br/>
            <strong>Tồn đọng (Nợ) = Vốn góp + Lãi lũy kế - Đã rút</strong>
          </p>
          <div className="table-responsive">
            <table className="table" style={{ fontSize: '0.875rem' }}>
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
                {capitalReport.map(r => (
                  <tr key={r.person}>
                    <td style={{ fontWeight: 600 }}>{r.person}</td>
                    <td style={{ color: 'var(--color-success)' }}>+{formatCurrency(r.contributed)}</td>
                    <td style={{ color: 'var(--color-success)' }}>+{formatCurrency(r.profit)}</td>
                    <td style={{ color: 'var(--color-danger)' }}>-{formatCurrency(r.withdrawn)}</td>
                    <td style={{ fontWeight: 700, color: r.balance < 0 ? 'var(--color-danger)' : 'var(--color-primary)' }}>
                      {formatCurrency(r.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>Lịch Sử Giao Dịch</h3>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Filter size={16} style={{ color: 'var(--color-text-muted)' }} />
              <input 
                type="month" 
                value={filterMonth} 
                onChange={e => setFilterMonth(e.target.value)} 
                style={{ ...inputStyle, width: '130px', padding: '0.25rem 0.5rem', fontSize: '0.875rem' }} 
              />
              <select 
                value={filterAccount} 
                onChange={e => setFilterAccount(e.target.value)} 
                style={{ ...inputStyle, width: '150px', padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
              >
                <option value="">Tất cả tài khoản</option>
                {accounts.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          
          <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="table" style={{ fontSize: '0.875rem' }}>
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Loại</th>
                  <th>Tài khoản</th>
                  <th>Nội dung</th>
                  <th>Số tiền</th>
                  <th>Số dư</th>
                  <th style={{ width: '80px' }}></th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // 1. Sort ascending to calculate running balance
                  const sortedTxns = [...(transactions || [])].sort((a, b) => {
                    const dateDiff = new Date(a.date) - new Date(b.date);
                    if (dateDiff !== 0) return dateDiff;
                    // fallback to id if same date
                    return (a.id || '').localeCompare(b.id || '');
                  });

                  // 2. Track running balance
                  let runningBalances = {};
                  accounts.forEach(a => runningBalances[a] = 0);
                  let totalFundBalance = 0;

                  const txnsWithBalance = sortedTxns.map(t => {
                    const amt = Number(t.amount) || 0;
                    if (t.type === 'THU') {
                      runningBalances[t.account] = (runningBalances[t.account] || 0) + amt;
                      totalFundBalance += amt;
                    } else if (t.type === 'CHI') {
                      runningBalances[t.account] = (runningBalances[t.account] || 0) - amt;
                      totalFundBalance -= amt;
                    } else if (t.type === 'CHUYEN') {
                      runningBalances[t.fromAccount] = (runningBalances[t.fromAccount] || 0) - amt;
                      runningBalances[t.toAccount] = (runningBalances[t.toAccount] || 0) + amt;
                    }
                    
                    return {
                      ...t,
                      balancesAfter: { ...runningBalances },
                      totalBalanceAfter: totalFundBalance
                    };
                  });

                  // 3. Filter and reverse
                  let displayTxns = txnsWithBalance;
                  if (filterMonth) displayTxns = displayTxns.filter(t => t.date.startsWith(filterMonth));
                  if (filterAccount) displayTxns = displayTxns.filter(t => t.account === filterAccount || t.fromAccount === filterAccount || t.toAccount === filterAccount);
                  
                  displayTxns.reverse(); // Newest top
                  
                  if (displayTxns.length === 0) {
                     return <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>Không tìm thấy giao dịch nào</td></tr>;
                  }

                  return displayTxns.map(t => (
                    <tr key={t.id}>
                      <td>{t.date}</td>
                      <td>
                        {t.type === 'THU' && <span style={{ color: 'var(--color-success)' }}><ArrowDownRight size={16} /> Thu</span>}
                        {t.type === 'CHI' && <span style={{ color: 'var(--color-danger)' }}><ArrowUpRight size={16} /> Chi</span>}
                        {t.type === 'CHUYEN' && <span style={{ color: 'var(--color-primary)' }}><ArrowRightLeft size={16} /> Chuyển</span>}
                      </td>
                      <td>
                        {t.type === 'CHUYEN' ? `${t.fromAccount} -> ${t.toAccount}` : t.account}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{t.type === 'CHUYEN' ? 'Chuyển tiền nội bộ' : t.category}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          {t.person && <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>[{t.person}] </span>}
                          {t.note}
                        </div>
                      </td>
                      <td style={{ fontWeight: 600, color: t.type === 'CHI' ? 'var(--color-danger)' : (t.type === 'THU' ? 'var(--color-success)' : 'var(--color-text-base)') }}>
                        {t.type === 'CHI' ? '-' : (t.type === 'THU' ? '+' : '')}{formatCurrency(t.amount)}
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                        {filterAccount 
                          ? formatCurrency(t.balancesAfter[filterAccount])
                          : formatCurrency(t.totalBalanceAfter)
                        }
                      </td>
                      <td>
                        <button className="btn" style={{ padding: '4px', color: 'var(--color-primary)' }} onClick={() => handleEdit(t)}>
                          <Edit size={16} />
                        </button>
                        <button className="btn" style={{ padding: '4px', color: 'var(--color-danger)', marginLeft: '4px' }} onClick={() => {
                          if (window.confirm('Bạn có chắc muốn xoá giao dịch này?')) deleteTransaction(t.id);
                        }}>
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '0.5rem',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg-base)',
  color: 'var(--color-text-base)',
  outline: 'none',
  boxSizing: 'border-box'
};

const labelStyle = {
  display: 'block', 
  fontSize: '0.875rem', 
  marginBottom: '0.25rem',
  fontWeight: 500
};
