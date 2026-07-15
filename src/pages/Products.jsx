import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../store/appStoreContext';
import { IconX as X, IconBox as PackageOpen, IconChevronDown as ChevronDown, IconChevronUp as ChevronUp, IconArrowDown as ArrowDown, IconArrowUp as ArrowUp, IconGripVertical as GripVertical, IconPencil as Pencil, IconRefresh } from '@tabler/icons-react';
import { calculateSuggestedPrice } from '../domain/inventory';
import { buildInventoryAdjustmentDisplayCodes } from '../domain/inventoryAdjustmentCodes';
import { normalizeProductSku, productMatchesSearch } from '../domain/productSku';
import ProductImage from '../components/ProductImage';
import { processAndCompressImage } from '../domain/imageProcessor';
import { deleteProductImage, uploadProductImage } from '../domain/imageStorage';
import { toast } from '../components/ui/toastHelper';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useAuth } from '../lib/AuthContext';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import FormField from '../components/ui/FormField';
import Modal from '../components/ui/Modal';
import SearchInput from '../components/ui/SearchInput';

export default function Products() {
  const { inventory, inventoryAdjustments, updateProduct, renameProductSku, reorderProducts, refresh, refreshing } = useAppStore();
  const { can } = useAuth();
  const canUpdateProducts = can('products', 'update');
  const [search, setSearch] = useState('');
  const [filterStock, setFilterStock] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [uploadingId, setUploadingId] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [sortMode, setSortMode] = useState('custom');
  const [reorderBusy, setReorderBusy] = useState(false);
  const [reorderingProductId, setReorderingProductId] = useState(null);
  const [draggedProductId, setDraggedProductId] = useState(null);
  const [dragOverProductId, setDragOverProductId] = useState(null);
  const [renamingProductId, setRenamingProductId] = useState(null);
  const [pendingImageRemoval, setPendingImageRemoval] = useState(null);
  const [pendingSkuRename, setPendingSkuRename] = useState(null);
  const [skuRenameError, setSkuRenameError] = useState('');
  const skuRenameInputRef = useRef(null);
  const adjustmentDisplayCodes = useMemo(
    () => buildInventoryAdjustmentDisplayCodes(inventoryAdjustments),
    [inventoryAdjustments]
  );

  const getBatchDisplayCode = (batch) => {
    const adjustmentPrefix = 'ADJUSTMENT-';
    if (!String(batch.purchaseId).startsWith(adjustmentPrefix)) return batch.purchaseId;

    const adjustmentId = String(batch.purchaseId).slice(adjustmentPrefix.length);
    return adjustmentDisplayCodes.get(adjustmentId) || batch.purchaseId;
  };

  const handleImageUpload = async (productId, e) => {
    const file = e.target.files[0];
    if (!file) return;
    const product = inventory.find(item => item.id === productId);
    try {
      setUploadingId(productId);
      const dataUrl = await processAndCompressImage(file);
      const oldImageId = product?.imageId;
      const imageUrl = await uploadProductImage(productId, dataUrl);
      try {
        await updateProduct(productId, { imageId: imageUrl });
      } catch (error) {
        await deleteProductImage(imageUrl).catch(() => {});
        throw error;
      }
      await deleteProductImage(oldImageId).catch(error => console.warn('Không thể xóa ảnh cũ:', error));
      toast.success(`Đã cập nhật ảnh sản phẩm ${product?.sku || productId}.`);
    } catch (err) {
      console.error(err);
      toast.error(`Lỗi khi tải ảnh: ${err.message}`);
    } finally {
      setUploadingId(null);
    }
  };

  const handleRemoveImage = (product, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!product.imageId) return;
    setPendingImageRemoval(product);
  };

  const confirmRemoveImage = async () => {
    if (!pendingImageRemoval?.imageId) return;

    try {
      setUploadingId(pendingImageRemoval.id);
      setImagePreview(null);
      await updateProduct(pendingImageRemoval.id, { imageId: null });
      await deleteProductImage(pendingImageRemoval.imageId);
      toast.success(`Đã xóa ảnh sản phẩm ${pendingImageRemoval.sku || pendingImageRemoval.id}.`);
      setPendingImageRemoval(null);
    } catch (err) {
      console.error(err);
      toast.error(`Không thể xóa hình sản phẩm: ${err.message}`);
    } finally {
      setUploadingId(null);
    }
  };

  const showImagePreview = (product) => {
    if (!product.imageId) return;
    setImagePreview({ imageId: product.imageId, name: product.name });
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
      setReorderingProductId(productId);
      await reorderProducts(nextOrder.map(product => product.id));
      const movedProduct = orderedInventory[currentIndex];
      toast.success(`Đã đổi thứ tự sản phẩm ${movedProduct.sku || movedProduct.id}.`);
    } catch (error) {
      toast.error(`Không thể đổi thứ tự sản phẩm: ${error.message}`);
    } finally {
      setReorderBusy(false);
      setReorderingProductId(null);
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
      setReorderingProductId(sourceProductId);
      await reorderProducts(nextOrder.map(product => product.id));
      toast.success(`Đã đổi thứ tự sản phẩm ${movedProduct.sku || movedProduct.id}.`);
    } catch (error) {
      toast.error(`Không thể đổi thứ tự sản phẩm: ${error.message}`);
    } finally {
      setReorderBusy(false);
      setReorderingProductId(null);
    }
  };

  const handleRenameSku = (product, event) => {
    event.stopPropagation();
    setSkuRenameError('');
    setPendingSkuRename({ product, newSku: product.sku || '' });
  };

  const confirmRenameSku = async () => {
    if (!pendingSkuRename) return;

    const normalizedSku = normalizeProductSku(pendingSkuRename.newSku);
    if (!normalizedSku) {
      setSkuRenameError('SKU mới không được để trống.');
      return;
    }
    if (normalizedSku === normalizeProductSku(pendingSkuRename.product.sku)) {
      setSkuRenameError('SKU mới phải khác SKU hiện tại.');
      return;
    }

    try {
      setRenamingProductId(pendingSkuRename.product.id);
      await renameProductSku(pendingSkuRename.product.id, normalizedSku);
      toast.success(`Đã đổi SKU ${pendingSkuRename.product.sku || pendingSkuRename.product.id} thành ${normalizedSku}. Tồn kho và lịch sử bán hàng vẫn được giữ nguyên.`);
      setPendingSkuRename(null);
    } catch (error) {
      toast.error(`Không thể đổi SKU: ${error.message}`);
    } finally {
      setRenamingProductId(null);
    }
  };

  const normalizedSearch = search.trim().toLocaleLowerCase('vi');
  let filteredProducts = orderedInventory.filter(p => productMatchesSearch(p, normalizedSearch));

  filteredProducts = filteredProducts.filter(p => {
    if (filterStock === 'all') return true;
    const threshold = p.id.includes('LX') ? 50 : 10;
    if (filterStock === 'low') return p.stock > 0 && p.stock <= threshold;
    if (filterStock === 'out') return p.stock <= 0;
    return true;
  });

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Quản lý Tồn Kho (FIFO)"
        description="Theo dõi tồn kho và giá vốn chi tiết theo từng lô nhập"
        actions={<Button variant="secondary" icon={IconRefresh} loading={refreshing} onClick={() => refresh().catch(() => toast.error('Không thể làm mới dữ liệu'))}>Làm mới</Button>}
      />

      <div className="card inventory-card">
        <div className="inventory-toolbar">
          <div className="inventory-toolbar-grid">
            <div className="ui-form-field inventory-search-field">
              <label htmlFor="inventory-sku-search">Tìm sản phẩm theo mã SKU</label>
              <div className="inventory-search-control">
                <SearchInput
                  id="inventory-sku-search"
                  label="Tìm sản phẩm theo mã SKU"
                  placeholder="Nhập mã SKU, ví dụ: LX01..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  autoComplete="off"
                />
                {search ? <Button
                  variant="ghost"
                  size="sm"
                  icon={X}
                  iconOnly
                  aria-label="Xóa nội dung tìm kiếm"
                  onClick={() => setSearch('')}
                /> : null}
              </div>
              <span className="inventory-search-meta" aria-live="polite">
                {normalizedSearch ? `Tìm thấy ${filteredProducts.length} sản phẩm phù hợp` : `${filteredProducts.length} sản phẩm trong kho`}
              </span>
            </div>
            <FormField label="Trạng thái tồn kho" className="inventory-filter-field">
              <select id="inventory-stock-filter" value={filterStock} onChange={(event) => setFilterStock(event.target.value)}>
                <option value="all">Tất cả sản phẩm</option>
                <option value="low">Sắp hết hàng</option>
                <option value="out">Đã hết hàng</option>
              </select>
            </FormField>
            <FormField label="Sắp xếp sản phẩm" className="inventory-filter-field">
              <select id="inventory-sort-mode" value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                <option value="custom">Thứ tự tùy chỉnh</option>
                <option value="sku">Theo mã SKU</option>
              </select>
            </FormField>
          </div>
        </div>

        <div className="table-container inventory-table-container">
          <table>
            <thead>
              <tr>
                <th className="inventory-toggle-column"></th>
                <th className="inventory-image-column">Hình</th>
                <th>Mã SP</th>
                <th>Sản phẩm</th>
                <th className="num">Đã nhập</th>
                <th className="num">Đã bán</th>
                <th className="num">Hao hụt</th>
                <th className="num">Tổng Tồn (Thực)</th>
                <th>Trạng thái</th>
                <th className="inventory-order-column">Thứ tự</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={10} className="inventory-empty-cell">
                    <EmptyState
                      icon={PackageOpen}
                      title="Không tìm thấy sản phẩm phù hợp"
                      description="Kiểm tra lại mã SKU hoặc chọn trạng thái tồn kho khác."
                    />
                  </td>
                </tr>
              )}
              {filteredProducts.map(product => {
                const isExpanded = expandedId === product.id;
                const remainingBatches = product.batches.filter(b => b.qtyRemaining > 0);
                
                return (
                  <React.Fragment key={product.id}>
                    <tr
                      className={`inventory-row ${isExpanded ? 'is-expanded' : ''} ${dragOverProductId === product.id ? 'inventory-row-drag-over' : ''}`.trim()}
                      onClick={() => setExpandedId(isExpanded ? null : product.id)}
                      onDragOver={(event) => {
                        if (!canUpdateProducts) return;
                        if (sortMode !== 'custom' || reorderBusy) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setDragOverProductId(product.id);
                      }}
                      onDragLeave={() => setDragOverProductId(current => current === product.id ? null : current)}
                      onDrop={(event) => {
                        if (canUpdateProducts) handleDropProduct(product.id, event);
                      }}
                    >
                      <td>
                        {remainingBatches.length > 0 ? (
                          isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />
                        ) : null}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div
                          className="inventory-image-control"
                          onMouseEnter={() => showImagePreview(product)}
                          onMouseMove={() => showImagePreview(product)}
                          onMouseLeave={() => setImagePreview(null)}
                          onFocus={() => {
                            showImagePreview(product);
                          }}
                          onBlur={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget)) setImagePreview(null);
                          }}
                        >
                          {can('products', 'create') ? <label
                            tabIndex={0}
                            className={`inventory-upload-label ${uploadingId === product.id ? 'is-uploading' : ''}`.trim()}
                            title="Bấm để tải ảnh mới"
                            aria-label={`Tải ảnh cho sản phẩm ${product.sku || product.id}`}
                          >
                            <ProductImage imageId={product.imageId} alt={product.name} size={52} />
                            <input className="ui-visually-hidden" type="file" accept="image/*" onChange={(e) => handleImageUpload(product.id, e)} disabled={uploadingId === product.id} />
                          </label> : <ProductImage imageId={product.imageId} alt={product.name} size={52} />}
                          {product.imageId && can('products', 'delete') && (
                            <button
                              type="button"
                              className="inventory-image-remove"
                              onClick={(e) => handleRemoveImage(product, e)}
                              aria-label={`Xóa hình của ${product.sku || product.id}`}
                            >
                              <X size={10} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="inventory-sku-cell" onClick={(event) => event.stopPropagation()}>
                        <div className="inventory-sku-heading">
                          <span>{product.sku || product.id}</span>
                          {canUpdateProducts && <Button
                            variant="ghost"
                            size="sm"
                            icon={Pencil}
                            iconOnly
                            onClick={(event) => handleRenameSku(product, event)}
                            aria-label={`Đổi SKU ${product.sku || product.id}`}
                            title="Đổi SKU và giữ lịch sử"
                            loading={renamingProductId === product.id}
                          />}
                        </div>
                        {(product.aliases || []).length > 0 && (
                          <div className="inventory-sku-aliases">
                            Mã cũ: {product.aliases.join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="inventory-product-name">{product.name}</td>
                      <td className="num inventory-value-success">{product.totalImported}</td>
                      <td className="num inventory-value-primary">{product.totalSold}</td>
                      <td className="num inventory-value-danger">{product.totalLost}</td>
                      <td className="num inventory-stock-value">{product.stock}</td>
                      <td>
                        {(() => {
                          const threshold = product.id.includes('LX') ? 50 : 10;
                          if (product.stock > threshold) {
                            return <Badge variant="success">Sẵn hàng</Badge>;
                          } else if (product.stock > 0) {
                            return <Badge variant="warning">Sắp hết</Badge>;
                          } else {
                            return <Badge variant="danger">Hết hàng</Badge>;
                          }
                        })()}
                      </td>
                      <td className="inventory-order-actions" onClick={(e) => e.stopPropagation()}>
                        {sortMode === 'custom' && canUpdateProducts && (
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
                            <Button variant="ghost" size="sm" icon={ArrowUp} iconOnly aria-label={`Đưa ${product.sku || product.id} lên`} disabled={reorderBusy || orderedInventory[0]?.id === product.id} loading={reorderBusy && reorderingProductId === product.id} onClick={(e) => handleMoveProduct(product.id, -1, e)} />
                            <Button variant="ghost" size="sm" icon={ArrowDown} iconOnly aria-label={`Đưa ${product.sku || product.id} xuống`} disabled={reorderBusy || orderedInventory[orderedInventory.length - 1]?.id === product.id} loading={reorderBusy && reorderingProductId === product.id} onClick={(e) => handleMoveProduct(product.id, 1, e)} />
                          </>
                        )}
                      </td>
                    </tr>
                    
                    {/* Expanded details showing batches */}
                    {isExpanded && remainingBatches.length > 0 && (
                      <tr>
                        <td colSpan={10} className="inventory-batches-cell">
                          <div className="inventory-batches-panel">
                            <h4 className="h4 inventory-batches-title">
                              Chi tiết các lô hàng đang còn trong kho (Nhập trước -&gt; Xuất trước)
                            </h4>
                            <div className="inventory-batch-grid">
                              {remainingBatches.map((batch, idx) => (
                                <div key={idx} className="inventory-batch-card">
                                  <div className="inventory-batch-header">
                                    <span>Lô: {getBatchDisplayCode(batch)}</span>
                                    <Badge variant="success" className="inventory-batch-badge">Tồn: {batch.qtyRemaining}</Badge>
                                  </div>
                                  <div className="inventory-batch-meta">Ngày nhập: {batch.date}</div>
                                  <div className="inventory-batch-cost num">
                                    Giá vốn: {batch.costVnd.toLocaleString()} đ
                                  </div>
                                  <div className="inventory-batch-price num">
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
            </tbody>
          </table>
        </div>
      </div>

      {imagePreview && createPortal(
        <div
          role="img"
          aria-label={`Ảnh phóng to: ${imagePreview.name}`}
          className="inventory-image-preview"
        >
          <ProductImage imageId={imagePreview.imageId} alt={imagePreview.name} size={320} />
        </div>,
        document.body
      )}
      <ConfirmDialog
        open={Boolean(pendingImageRemoval)}
        onClose={() => uploadingId === pendingImageRemoval?.id ? undefined : setPendingImageRemoval(null)}
        onConfirm={confirmRemoveImage}
        title="Xóa ảnh sản phẩm"
        itemName={pendingImageRemoval?.sku || pendingImageRemoval?.id}
        loading={uploadingId === pendingImageRemoval?.id}
      />
      <Modal
        open={Boolean(pendingSkuRename)}
        onClose={() => renamingProductId === pendingSkuRename?.product.id ? undefined : setPendingSkuRename(null)}
        title="Đổi SKU"
        initialFocusRef={skuRenameInputRef}
        closeOnOverlayClick={!renamingProductId}
        closeOnEscape={!renamingProductId}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setPendingSkuRename(null)} disabled={Boolean(renamingProductId)}>Hủy</Button>
            <Button onClick={confirmRenameSku} loading={renamingProductId === pendingSkuRename?.product.id}>Đổi SKU</Button>
          </>
        )}
      >
        <FormField
          label={`SKU mới cho ${pendingSkuRename?.product.name || 'sản phẩm'}`}
          helpText="SKU cũ vẫn được giữ trong lịch sử bán hàng và tồn kho."
          error={skuRenameError}
        >
          <input
            ref={skuRenameInputRef}
            value={pendingSkuRename?.newSku || ''}
            onChange={(event) => {
              setSkuRenameError('');
              setPendingSkuRename(current => current ? { ...current, newSku: event.target.value } : current);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                confirmRenameSku();
              }
            }}
          />
        </FormField>
      </Modal>
    </div>
  );
}
