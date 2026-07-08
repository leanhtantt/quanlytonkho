import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStoreContext';
import { calculateProfitAnalytics } from '../domain/profitAnalytics';
import { Wallet, ArrowUpRight, ArrowDownRight, ArrowRightLeft, Plus, Trash2 } from 'lucide-react';

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
}

export default function Treasury() {
  const { transactions, addTransaction, deleteTransaction, orders, losses, ads } = useAppStore();

  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState('THU'); // THU, CHI, CHUYEN
  const [account, setAccount] = useState('Hà');
  const [fromAccount, setFromAccount] = useState('Hà');
  const [toAccount, setToAccount] = useState('Luyến');
  const [category, setCategory] = useState('Rút tiền từ Sàn');
  const [person, setPerson] = useState('Hà'); // Hà, Châu, Luyến
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  // 1. Calculate Balances & Capital
  let balanceHa = 0;
  let balanceLuyen = 0;
  let balanceChau = 0;
  let balanceCash = 0;
  const capital = {
    'Hà': { contributed: 0, withdrawn: 0 },
    'Luyến': { contributed: 0, withdrawn: 0 },
    'Châu': { contributed: 0, withdrawn: 0 }
  };

  if (transactions && transactions.length > 0) {
    transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      
      if (t.type === 'THU') {
        if (t.account === 'Hà') balanceHa += amt;
        if (t.account === 'Luyến') balanceLuyen += amt;
        if (t.account === 'Châu') balanceChau += amt;
        if (t.account === 'Tiền mặt') balanceCash += amt;
        if (t.category === 'Nhận vốn góp' && t.person && capital[t.person]) {
          capital[t.person].contributed += amt;
        }
      } else if (t.type === 'CHI') {
        if (t.account === 'Hà') balanceHa -= amt;
        if (t.account === 'Luyến') balanceLuyen -= amt;
        if (t.account === 'Châu') balanceChau -= amt;
        if (t.account === 'Tiền mặt') balanceCash -= amt;
        if (t.category === 'Rút vốn / Chia lợi nhuận' && t.person && capital[t.person]) {
          capital[t.person].withdrawn += amt;
        }
      } else if (t.type === 'CHUYEN') {
        if (t.fromAccount === 'Hà') balanceHa -= amt;
        if (t.fromAccount === 'Luyến') balanceLuyen -= amt;
        if (t.fromAccount === 'Châu') balanceChau -= amt;
        if (t.fromAccount === 'Tiền mặt') balanceCash -= amt;
        if (t.toAccount === 'Hà') balanceHa += amt;
        if (t.toAccount === 'Luyến') balanceLuyen += amt;
        if (t.toAccount === 'Châu') balanceChau += amt;
        if (t.toAccount === 'Tiền mặt') balanceCash += amt;
      }
    });
  }

  // Calculate profit share
  const profitData = useMemo(() => calculateProfitAnalytics(orders, losses, ads), [orders, losses, ads]);
  let totalPartnerShare = 0;
  profitData.forEach(row => {
    if (row.isTotal) {
      totalPartnerShare += row.eachPartnerShare;
    }
  });

  const capitalReport = ['Hà', 'Châu', 'Luyến'].map(p => {
    const cap = capital[p];
    const balance = cap.contributed + totalPartnerShare - cap.withdrawn;
    return {
      person: p,
      contributed: cap.contributed,
      profit: totalPartnerShare,
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

    addTransaction(newTxn);
    setShowForm(false);
    setAmount('');
    setNote('');
  };

  const getCategoryOptions = () => {
    if (type === 'THU') return ['Rút tiền từ Sàn', 'Nhận vốn góp', 'Thu khác'];
    if (type === 'CHI') return ['Tiền nhập hàng', 'Tiền quảng cáo (Ads)', 'Rút vốn / Chia lợi nhuận', 'Chi phí khác'];
    return [];
  };

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--color-primary)' }}>
          <div style={{ background: 'var(--color-bg-hover)', padding: '1rem', borderRadius: '50%', color: 'var(--color-primary)' }}>
            <Wallet size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>SỐ DƯ TK HÀ</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: balanceHa < 0 ? 'var(--color-danger)' : 'var(--color-text-base)' }}>
              {formatCurrency(balanceHa)}
            </div>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid #10b981' }}>
          <div style={{ background: '#ecfdf5', padding: '1rem', borderRadius: '50%', color: '#10b981' }}>
            <Wallet size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>SỐ DƯ TK LUYẾN</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: balanceLuyen < 0 ? 'var(--color-danger)' : 'var(--color-text-base)' }}>
              {formatCurrency(balanceLuyen)}
            </div>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ background: '#fef3c7', padding: '1rem', borderRadius: '50%', color: '#f59e0b' }}>
            <Wallet size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>SỐ DƯ TK CHÂU</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: balanceChau < 0 ? 'var(--color-danger)' : 'var(--color-text-base)' }}>
              {formatCurrency(balanceChau)}
            </div>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid #14b8a6' }}>
          <div style={{ background: '#ccfbf1', padding: '1rem', borderRadius: '50%', color: '#14b8a6' }}>
            <Wallet size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>TIỀN MẶT</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: balanceCash < 0 ? 'var(--color-danger)' : 'var(--color-text-base)' }}>
              {formatCurrency(balanceCash)}
            </div>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid #6366f1' }}>
          <div style={{ background: '#e0e7ff', padding: '1rem', borderRadius: '50%', color: '#6366f1' }}>
            <Wallet size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>TỔNG QUỸ CHUNG</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: (balanceHa + balanceLuyen + balanceChau + balanceCash) < 0 ? 'var(--color-danger)' : 'var(--color-text-base)' }}>
              {formatCurrency(balanceHa + balanceLuyen + balanceChau + balanceCash)}
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="card animate-fade-in" style={{ marginBottom: '2rem', border: '1px solid var(--color-primary)' }}>
          <h3 style={{ marginBottom: '1.5rem' }}>Ghi Nhận Dòng Tiền Mới</h3>
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
                    <option value="Hà">TK Hà</option>
                    <option value="Luyến">TK Luyến</option>
                    <option value="Châu">TK Châu</option>
                    <option value="Tiền mặt">Tiền mặt</option>
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
                      <option value="Hà">Hà</option>
                      <option value="Châu">Châu</option>
                      <option value="Luyến">Luyến</option>
                    </select>
                  </div>
                )}
              </>
            ) : (
              <>
                <div>
                  <label style={labelStyle}>Từ Tài Khoản</label>
                  <select value={fromAccount} onChange={e => setFromAccount(e.target.value)} style={inputStyle}>
                    <option value="Hà">TK Hà</option>
                    <option value="Luyến">TK Luyến</option>
                    <option value="Châu">TK Châu</option>
                    <option value="Tiền mặt">Tiền mặt</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Đến Tài Khoản</label>
                  <select value={toAccount} onChange={e => setToAccount(e.target.value)} style={inputStyle}>
                    <option value="Luyến">TK Luyến</option>
                    <option value="Hà">TK Hà</option>
                    <option value="Châu">TK Châu</option>
                    <option value="Tiền mặt">Tiền mặt</option>
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
            <button className="btn btn-outline" onClick={() => setShowForm(false)}>Hủy</button>
            <button className="btn btn-primary" onClick={handleSave}>Lưu Giao Dịch</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Báo Cáo Vốn & Cổ Tức</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
            Lợi nhuận được chia tích lũy từ tất cả các tháng (đã trừ phần quỹ chung của Shop).<br/>
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
          <h3 style={{ marginBottom: '1rem' }}>Lịch Sử Giao Dịch</h3>
          <div className="table-responsive" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table className="table" style={{ fontSize: '0.875rem' }}>
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Loại</th>
                  <th>Tài khoản</th>
                  <th>Nội dung</th>
                  <th>Số tiền</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(transactions || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date)).map(t => (
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
                    <td>
                      <button className="btn" style={{ padding: '4px', color: 'var(--color-danger)' }} onClick={() => {
                        if (window.confirm('Bạn có chắc muốn xoá giao dịch này?')) deleteTransaction(t.id);
                      }}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {(!transactions || transactions.length === 0) && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>Chưa có giao dịch nào</td>
                  </tr>
                )}
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
