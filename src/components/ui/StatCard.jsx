export default function StatCard({
  label,
  value,
  icon: Icon,
  description,
  trend,
  className = '',
}) {
  return (
    <article className={`ui-stat-card card ${className}`.trim()}>
      <div className="ui-stat-card__content">
        <p className="text-small ui-stat-card__label">{label}</p>
        <p className="ui-stat-card__value num">{value}</p>
        {description ? <p className="text-caption">{description}</p> : null}
        {trend ? <div className="ui-stat-card__trend">{trend}</div> : null}
      </div>
      {Icon ? <Icon className="ui-stat-card__icon" size={24} aria-hidden="true" /> : null}
    </article>
  );
}
