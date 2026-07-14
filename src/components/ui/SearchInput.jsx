import { forwardRef } from 'react';
import { IconSearch } from '@tabler/icons-react';

const SearchInput = forwardRef(function SearchInput(
  { className = '', label = 'Tìm kiếm', ...props },
  ref,
) {
  return (
    <label className={`ui-search-input ${className}`.trim()}>
      <span className="ui-visually-hidden">{label}</span>
      <IconSearch size={20} aria-hidden="true" />
      <input ref={ref} type="search" aria-label={label} {...props} />
    </label>
  );
});

export default SearchInput;
