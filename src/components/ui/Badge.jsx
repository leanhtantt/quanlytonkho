export default function Badge({ variant = 'info', className = '', children, ...props }) {
  return (
    <span className={`badge badge-${variant} ${className}`.trim()} {...props}>
      {children}
    </span>
  );
}
