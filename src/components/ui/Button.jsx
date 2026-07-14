import { forwardRef } from 'react';
import Spinner from './Spinner';

const Button = forwardRef(function Button(
  {
    children,
    className = '',
    variant = 'primary',
    size = 'md',
    loading = false,
    icon: Icon,
    iconPosition = 'start',
    iconOnly = false,
    disabled = false,
    title,
    'aria-label': ariaLabel,
    ...props
  },
  ref,
) {
  const isIconOnly = iconOnly || (!children && Icon);
  const hasIcon = Boolean(Icon);

  if (isIconOnly && !ariaLabel) {
    throw new Error('Button chỉ có icon phải nhận prop aria-label.');
  }

  const shouldShowStartIcon = Icon && iconPosition === 'start';
  const shouldShowEndIcon = Icon && iconPosition === 'end';
  const buttonClassName = [
    'ui-button',
    `ui-button--${variant}`,
    `ui-button--${size}`,
    isIconOnly && 'ui-button--icon-only',
    hasIcon && 'has-icon',
    loading && 'is-loading',
    className,
  ].filter(Boolean).join(' ');

  const renderIcon = (position) => {
    if (!Icon || (position === 'start' && !shouldShowStartIcon) || (position === 'end' && !shouldShowEndIcon)) {
      return null;
    }

    return loading
      ? <Spinner size="button" label="Đang xử lý" />
      : <Icon size={20} aria-hidden="true" />;
  };

  return (
    <button
      ref={ref}
      type="button"
      className={buttonClassName}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={ariaLabel}
      title={isIconOnly ? (title || ariaLabel) : title}
      {...props}
    >
      {loading && !Icon ? (
        <span className="ui-button__loading-overlay">
          <Spinner size="button" label="Đang xử lý" />
        </span>
      ) : renderIcon('start')}
      {children ? <span className="ui-button__label">{children}</span> : null}
      {renderIcon('end')}
    </button>
  );
});

export default Button;
