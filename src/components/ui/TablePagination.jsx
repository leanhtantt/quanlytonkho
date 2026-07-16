import Button from './Button';

export default function TablePagination({
  page,
  totalItems,
  pageSize = 50,
  itemLabel,
  onPageChange,
  className = '',
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const firstItem = totalItems === 0 ? 0 : ((currentPage - 1) * pageSize) + 1;
  const lastItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <nav className={`table-pagination ${className}`.trim()} aria-label={`Phân trang ${itemLabel}`}>
      <span aria-live="polite">
        {totalItems === 0
          ? `Không có ${itemLabel}`
          : `Hiển thị ${firstItem}-${lastItem} / ${totalItems} ${itemLabel}`}
      </span>
      <div>
        <Button size="sm" variant="secondary" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>Trước</Button>
        <span>Trang {currentPage}/{totalPages}</span>
        <Button size="sm" variant="secondary" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>Sau</Button>
      </div>
    </nav>
  );
}
