import React, { useState } from 'react';
import { useAppStore } from '../store/appStoreContext';
import { Search, X, PackageOpen, ChevronDown, ChevronUp, ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { calculateSuggestedPrice } from '../domain/inventory';
import ProductImage from '../components/ProductImage';
import { processAndCompressImage } from '../domain/imageProcessor';
import { deleteProductImage, uploadProductImage } from '../domain/imageStorage';

export default function Products() {
  const { inventory, updateProduct, reorderProducts } = useAppStore();
  const [search, setSearch] = useState('');
  const [filterStock, setFilterStock] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [uploadingId, setUploadingId] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [sortMode, setSortMode] = useState('custom');
  const [reorderBusy, setReorderBusy] = useState(false);
  const [draggedProductId, setDraggedProductId] = useState(null);
  const [dragOverProductId, setDragOverProductId] = useState(null);

  const handleImageUpload = async (productId, e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      setUploadingId(productId);
      const dataUrl = await processAndCompressImage(file);
      const oldImageId = inventory.find(product => product.id === productId)?.imageId;
      const imageUrl = await uploadProductImage(productId, dataUrl);
      try {
        await updateProduct(productId, { imageId: imageUrl });
      } catch (error) {
        await deleteProductImage(imageUrl).catch(() => {});
        throw error;
      }
      await deleteProductImage(oldImageId).catch(error => console.warn('Không thể xóa ảnh cũ:', error));
    } catch (err) {
      console.error(err);
      alert('Lỗi khi tải ảnh');
    } finally {
      setUploadingId(null);
    }
  };

  const handleRemoveImage = async (product, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!product.imageId || !window.confirm(`Xóa hình của sản phẩm "${product.sku || product.id}"?`)) return;

    try {
      setUploadingId(product.id);
      setImagePreview(null);
      await updateProduct(product.id, { imageId: null });
      await deleteProductImage(product.imageId);
    } catch (err) {
      console.error(err);
      alert('Không thể xóa hình sản phẩm');
    } finally {
      setUploadingId(null);
    }
  };

  const showImagePreview = (product, event) => {
    if (!product.imageId) return;
    const previewSize = 336;
    const gap = 10;
    const preferredLeft = event.clientX + gap;
    const left = preferredLeft + previewSize <= window.innerWidth - gap
      ? preferredLeft
      : Math.max(gap, event.clientX - previewSize - gap);
    const top = Math.max(gap, Math.min(event.clientY - 24, window.innerHeight - previewSize - gap));
    setImagePreview({ imageId: product.imageId, name: product.name, left, top });
  };

  const compareBySku = (a, b) => {
    const codeA = a.sku || a.id || '';
    const codeB = b.sku || b.id || '';
    if (codeA === codeB) return (a.name || '').localeCompare(b.name || '', 'vi', { sensitivity: 'base' });
    return codeA.localeCompare(codeB, 'vi', { numeric: true, sensitivity: 'base' });
  };

  const orderedInventory = [...inventory].sort((a, b) => {
    if (sortMode === 'sku') return compareBySku(a, b);
    const orderA = Number(a.displayOrder) || Number.MAX_SAFE_INTEGER;
    const orderB = Number(b.displayOrder) || Number.MAX_SAFE_INTEGER;
    return orderA === orderB ? compareBySku(a, b) : orderA - orderB;
  });

  const handleMoveProduct = async (productId, direction, event) => {
    event.stopPropagation();
    const currentIndex = orderedInventory.findIndex(product => product.id === productId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedInventory.length || reorderBusy) return;

    const nextOrder = [...orderedInventory];
    [nextOrder[currentIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[currentIndex]];
    try {
      setReorderBusy(true);
      await reorderProducts(nextOrder.map(product => product.id));
    } catch (error) {
      alert(`Không thể đổi thứ tự sản phẩm: ${error.message}`);
    } finally {
      setReorderBusy(false);
    }
  };

  const handleDragStart = (productId, event) => {
    if (sortMode !== 'custom' || reorderBusy) {
      event.preventDefault();
      return;
    }
    setDraggedProductId(productId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', productId);
  };

  const handleDropProduct = async (targetProductId, event) => {
    event.preventDefault();
    const sourceProductId = draggedProductId || event.dataTransfer.getData('text/plain');
    setDragOverProductId(null);
    setDraggedProductId(null);
    if (!sourceProductId || sourceProductId === targetProductId || reorderBusy) return;

    const sourceIndex = orderedInventory.findIndex(product => product.id === sourceProductId);
    const targetIndex = orderedInventory.findIndex(product => product.id === targetProductId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const nextOrder = [...orderedInventory];
    const [movedProduct] = nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, movedProduct);

    try {
      setReorderBusy(true);
      await reorderProducts(nextOrder.map(product => product.id));
    } catch (error) {
      alert(`Không thể đổi thứ tự sản phẩm: ${error.message}`);
    } finally {
      setReorderBusy(false);
    }
  };

  const normalizedSearch = search.trim().toLocaleLowerCase('vi');
  let filteredProducts = orderedInventory.filter(p => {
    if (!normalizedSearch) return true;
    const displayedSku = String(p.sku || p.id || '').toLocaleLowerCase('vi');
    const productName = String(p.name || '').toLocaleLowerCase('vi');
    return displayedSku.includes(normalizedSearch) || productName.includes(normalizedSearch);
  });

  filteredProducts = filteredProducts.filter(p => {
    if (filterStock === 'all') return true;
    const threshold = p.id.includes('LX') ? 50 : 10;
    if (filterStock === 'low') return p.stock > 0 && p.stock <= threshold;
    if (filterStock === 'out') return p.stock <= 0;
    return true;
  });

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý Tồn Kho (FIFO)</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Theo dõi tồn kho và giá vốn chi tiết theo từng lô nhập</p>
        </div>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-subtle)' }}>
          <div style={{ display: 'flex', gap: '1rem', width: '100%', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px', maxWidth: '560px' }}>
              <label htmlFor="inventory-sku-search" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-base)' }}>
                Tìm sản phẩm theo mã SKU
              </label>
              <div style={{ position: 'relative' }}>
                <Search aria-hidden="true" size={19} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-primary)', pointerEvents: 'none' }} />
              <input 
                id="inventory-sku-search"
                type="text" 
                placeholder="Nhập mã SKU, ví dụ: LX01..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
                style={{
                  width: '100%',
                  padding: '0.8rem 2.75rem 0.8rem 2.6rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-bg-surface)',
                  color: 'var(--color-text-base)',
                }}
              />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Xóa nội dung tìm kiếm"
                    title="Xóa tìm kiếm"
                    style={{
                      position: 'absolute', right: '0.55rem', top: '50%', transform: 'translateY(-50%)',
                      width: '2rem', height: '2rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      border: 'none', borderRadius: 'var(--radius-sm)', backgroundColor: 'transparent',
                      color: 'var(--color-text-muted)', cursor: 'pointer'
                    }}
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                )}
              </div>
              <div aria-live="polite" style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                {normalizedSearch ? `Tìm thấy ${filteredProducts.length} sản phẩm phù hợp` : `${filteredProducts.length} sản phẩm trong kho`}
              </div>
            </div>
            <div style={{ flex: '0 1 210px' }}>
              <label htmlFor="inventory-stock-filter" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-base)' }}>
                Trạng thái tồn kho
              </label>
              <select
                id="inventory-stock-filter"
                value={filterStock}
                onChange={(e) => setFilterStock(e.target.value)}
                style={{ width: '100%', padding: '0.8rem 1rem', backgroundColor: 'var(--color-bg-surface)' }}
              >
                <option value="all">Tất cả sản phẩm</option>
                <option value="low">Sắp hết hàng</option>
                <option value="out">Đã hết hàng</option>
              </select>
            </div>
            <div style={{ flex: '0 1 210px' }}>
              <label htmlFor="inventory-sort-mode" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-base)' }}>
                Sắp xếp sản phẩm
              </label>
              <select id="inventory-sort-mode" value={sortMode} onChange={(e) => setSortMode(e.target.value)} style={{ width: '100%', padding: '0.8rem 1rem', backgroundColor: 'var(--color-bg-surface)' }}>
                <option value="custom">Thứ tự tùy chỉnh</option>
                <option value="sku">Theo mã SKU</option>
              </select>
            </div>
          </div>
        </div>

        <div className="table-container" style={{ border: 'none', borderRadius: '0' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th style={{ width: '60px' }}>Hình</th>
                <th>Mã SP</th>
                <th>Sản phẩm</th>
                <th>Đã nhập</th>
                <th>Đã bán</th>
                <th>Hao hụt</th>
                <th>Tổng Tồn (Thực)</th>
                <th>Trạng thái</th>
                <th style={{ width: '88px', textAlign: 'center' }}>Thứ tự</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                    <PackageOpen size={36} aria-hidden="true" style={{ color: 'var(--color-text-muted)', marginBottom: '0.75rem' }} />
                    <div style={{ fontWeight: 600, color: 'var(--color-text-base)' }}>Không tìm thấy sản phẩm phù hợp</div>
                    <div style={{ marginTop: '0.35rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                      Kiểm tra lại mã SKU hoặc chọn trạng thái tồn kho khác.
                    </div>
                  </td>
                </tr>
              )}
              {filteredProducts.map(product => {
                const isExpanded = expandedId === product.id;
                const remainingBatches = product.batches.filter(b => b.qtyRemaining > 0);
                
                return (
                  <React.Fragment key={product.id}>
                    <tr
                      className={dragOverProductId === product.id ? 'inventory-row-drag-over' : ''}
                      style={{ cursor: 'pointer', backgroundColor: isExpanded ? 'var(--color-bg-hover)' : '' }}
                      onClick={() => setExpandedId(isExpanded ? null : product.id)}
                      onDragOver={(event) => {
                        if (sortMode !== 'custom' || reorderBusy) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setDragOverProductId(product.id);
                      }}
                      onDragLeave={() => setDragOverProductId(current => current === product.id ? null : current)}
                      onDrop={(event) => handleDropProduct(product.id, event)}
                    >
                      <td>
                        {remainingBatches.length > 0 ? (
                          isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />
                        ) : null}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div
                          style={{ position: 'relative', display: 'inline-block' }}
                          onMouseEnter={(e) => showImagePreview(product, e)}
                          onMouseMove={(e) => showImagePreview(product, e)}
                          onMouseLeave={() => setImagePreview(null)}
                          onFocus={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            showImagePreview(product, { clientX: rect.right, clientY: rect.top + 20 });
                          }}
                          onBlur={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget)) setImagePreview(null);
                          }}
                        >
                          <label
                            tabIndex={0}
                            style={{ cursor: uploadingId === product.id ? 'wait' : 'pointer', display: 'block', margin: 0 }}
                            title="Bấm để tải ảnh mới"
                            aria-label={`Tải ảnh cho sản phẩm ${product.sku || product.id}`}
                          >
                            <ProductImage imageId={product.imageId} alt={product.name} size={40} style={{ opacity: uploadingId === product.id ? 0.5 : 1 }} />
                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(product.id, e)} disabled={uploadingId === product.id} />
                          </label>
                          {product.imageId && (
                            <button
                              type="button"
                              onClick={(e) => handleRemoveImage(product, e)}
                              aria-label={`Xóa hình của ${product.sku || product.id}`}
                              title="Xóa hình"
                              disabled={uploadingId === product.id}
                              style={{
                                position: 'absolute', right: '-4px', top: '-4px', width: '16px', height: '16px',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                                border: '1px solid var(--color-border)', borderRadius: '50%', boxShadow: 'var(--shadow-sm)',
                                backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-danger)', cursor: 'pointer'
                              }}
                            >
                              <X size={10} strokeWidth={2.5} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--color-text-muted)' }}>{product.sku || product.id}</td>
                      <td style={{ fontWeight: 500 }}>{product.name}</td>
                      <td style={{ color: 'var(--color-success)' }}>{product.totalImported}</td>
                      <td style={{ color: 'var(--color-primary)' }}>{product.totalSold}</td>
                      <td style={{ color: 'var(--color-danger)' }}>{product.totalLost}</td>
                      <td style={{ fontWeight: 700, fontSize: '1.1rem' }}>{product.stock}</td>
                      <td>
                        {(() => {
                          const threshold = product.id.includes('LX') ? 50 : 10;
                          if (product.stock > threshold) {
                            return <span className="badge badge-success">Sẵn hàng</span>;
                          } else if (product.stock > 0) {
                            return <span className="badge badge-warning">Sắp hết</span>;
                          } else {
                            return <span className="badge badge-danger">Hết hàng</span>;
                          }
                        })()}
                      </td>
                      <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {sortMode === 'custom' && (
                          <>
                            <span
                              draggable={!reorderBusy}
                              onDragStart={(event) => handleDragStart(product.id, event)}
                              onDragEnd={() => { setDraggedProductId(null); setDragOverProductId(null); }}
                              title="Nhấn giữ và kéo để đổi vị trí"
                              aria-label={`Kéo ${product.sku || product.id} để đổi vị trí`}
                              className="inventory-drag-handle"
                            >
                              <GripVertical size={17} />
                            </span>
                            <button type="button" className="btn" aria-label={`Đưa ${product.sku || product.id} lên`} disabled={reorderBusy || orderedInventory[0]?.id === product.id} onClick={(e) => handleMoveProduct(product.id, -1, e)} style={{ padding: '0.25rem', color: 'var(--color-primary)' }}><ArrowUp size={16} /></button>
                            <button type="button" className="btn" aria-label={`Đưa ${product.sku || product.id} xuống`} disabled={reorderBusy || orderedInventory[orderedInventory.length - 1]?.id === product.id} onClick={(e) => handleMoveProduct(product.id, 1, e)} style={{ padding: '0.25rem', color: 'var(--color-primary)', marginLeft: '0.2rem' }}><ArrowDown size={16} /></button>
                          </>
                        )}
                      </td>
                    </tr>
                    
                    {/* Expanded details showing batches */}
                    {isExpanded && remainingBatches.length > 0 && (
                      <tr>
                        <td colSpan={10} style={{ padding: 0, backgroundColor: 'var(--color-bg-base)' }}>
                          <div style={{ padding: '1rem 3rem', borderLeft: '4px solid var(--color-primary)' }}>
                            <h5 style={{ marginBottom: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                              Chi tiết các lô hàng đang còn trong kho (Nhập trước -&gt; Xuất trước)
                            </h5>
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                              {remainingBatches.map((batch, idx) => (
                                <div key={idx} style={{ 
                                  backgroundColor: 'var(--color-bg-surface)', 
                                  border: '1px solid var(--color-border)', 
                                  padding: '0.75rem 1rem', 
                                  borderRadius: 'var(--radius-md)',
                                  minWidth: '200px'
                                }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Lô: {batch.purchaseId}</span>
                                    <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>Tồn: {batch.qtyRemaining}</span>
                                  </div>
                                  <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Ngày nhập: {batch.date}</div>
                                  <div style={{ fontSize: '0.875rem', color: 'var(--color-primary)', fontWeight: 600, marginTop: '0.5rem' }}>
                                    Giá vốn: {batch.costVnd.toLocaleString()} đ
                                  </div>
                                  <div style={{ fontSize: '0.875rem', color: 'var(--color-warning)', fontWeight: 600, marginTop: '0.25rem' }}>
                                    Giá bán tham khảo: {calculateSuggestedPrice(batch.costVnd).toLocaleString()} đ
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              
              
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                    <PackageOpen size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                    <p>Không tìm thấy sản phẩm nào.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {imagePreview && (
        <div
          role="img"
          aria-label={`Ảnh phóng to: ${imagePreview.name}`}
          style={{
            position: 'fixed', left: imagePreview.left, top: imagePreview.top, zIndex: 1000,
            padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-bg-surface)', boxShadow: 'var(--shadow-md)', pointerEvents: 'none'
          }}
        >
          <ProductImage imageId={imagePreview.imageId} alt={imagePreview.name} size={320} />
        </div>
      )}
    </div>
  );
}
