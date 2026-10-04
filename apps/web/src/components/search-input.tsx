import type { InputHTMLAttributes } from 'react';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
}

export function SearchInput({ value, onValueChange, className = '', placeholder = 'Search', ...props }: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase tracking-wide text-gray-400">Search</span>
      <input
        {...props}
        type="text"
        className="input-field pl-20 pr-10"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {value ? (
        <button
          type="button"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-lg font-semibold leading-none text-gray-500 hover:text-gray-900"
          aria-label="Clear search"
          onClick={() => onValueChange('')}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
