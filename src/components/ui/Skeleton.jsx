export default function Skeleton({
  className = '',
  width,
  height,
  rounded = false,
  lines = 1,
}) {
  const style = {
    ...(width ? { '--ui-skeleton-width': width } : {}),
    ...(height ? { '--ui-skeleton-height': height } : {}),
  };

  return (
    <span className={`ui-skeleton-group ${className}`.trim()} style={style} aria-busy="true">
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className={`ui-skeleton ${rounded ? 'ui-skeleton--rounded' : ''}`.trim()}
        />
      ))}
      <span className="ui-visually-hidden">Đang tải nội dung</span>
    </span>
  );
}
