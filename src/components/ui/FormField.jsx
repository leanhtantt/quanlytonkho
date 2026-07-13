import { cloneElement, isValidElement, useId } from 'react';

export default function FormField({
  label,
  error,
  helpText,
  children,
  inputProps,
  className = '',
}) {
  const generatedId = useId();
  const inputId = inputProps?.id || children?.props?.id || generatedId;
  const errorId = `${inputId}-error`;
  const helpTextId = `${inputId}-help`;
  const describedBy = [
    helpText ? helpTextId : null,
    error ? errorId : null,
  ].filter(Boolean).join(' ') || undefined;

  const field = isValidElement(children)
    ? cloneElement(children, {
      id: inputId,
      'aria-describedby': children.props['aria-describedby'] || describedBy,
      'aria-invalid': error ? true : children.props['aria-invalid'],
    })
    : <input id={inputId} aria-describedby={describedBy} aria-invalid={error ? true : undefined} {...inputProps} />;

  return (
    <div className={`ui-form-field ${className}`.trim()}>
      {label ? <label htmlFor={inputId}>{label}</label> : null}
      {field}
      {helpText ? <p id={helpTextId} className="text-caption">{helpText}</p> : null}
      {error ? <p id={errorId} className="ui-form-field__error" role="alert">{error}</p> : null}
    </div>
  );
}
