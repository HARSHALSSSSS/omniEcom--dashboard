import { useEffect, useState } from "react";

/**
 * Returns a debounced version of `value` that only updates after `ms` milliseconds
 * of inactivity. Useful for debouncing search inputs and form fields before API calls.
 */
export function useDebounced<T>(value: T, ms: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return debouncedValue;
}
