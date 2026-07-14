export default function Spinner({ size = 'md', label = 'Đang tải', className = '' }) {
  return (
    <span
      className={`ui-spinner ui-spinner--${size} ${className}`.trim()}
      role="status"
      aria-label={label}
    />
  );
}
