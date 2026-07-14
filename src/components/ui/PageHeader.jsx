export default function PageHeader({ title, description, actions, className = '' }) {
  return (
    <header className={`ui-page-header ${className}`.trim()}>
      <div>
        <h1 className="h1">{title}</h1>
        {description ? <p className="ui-page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="ui-page-header__actions">{actions}</div> : null}
    </header>
  );
}
