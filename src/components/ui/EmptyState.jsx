import { IconInbox } from '@tabler/icons-react';

export default function EmptyState({
  icon: Icon = IconInbox,
  title = 'Chưa có dữ liệu',
  description,
  action,
  className = '',
}) {
  return (
    <section className={`ui-empty-state ${className}`.trim()}>
      <Icon className="ui-empty-state__icon" size={48} aria-hidden="true" />
      <h2 className="h3">{title}</h2>
      {description ? <p>{description}</p> : null}
      {action ? <div className="ui-empty-state__action">{action}</div> : null}
    </section>
  );
}
