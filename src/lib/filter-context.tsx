'use client'

import { createContext, useContext, useState, ReactNode } from 'react';

interface FilterContextType {
  hasFilters: boolean;
  onClearFilters?: () => void;
  setHasFilters: (hasFilters: boolean) => void;
  setOnClearFilters: (callback: () => void) => void;
}

const FilterContext = createContext<FilterContextType>({
  hasFilters: false,
  setHasFilters: () => {},
  setOnClearFilters: () => {},
});

export function FilterProvider({ children }: { children: ReactNode }) {
  const [hasFilters, setHasFilters] = useState(false);
  const [onClearFilters, setOnClearFilters] = useState<(() => void) | undefined>();

  return (
    <FilterContext.Provider value={{
      hasFilters,
      onClearFilters,
      setHasFilters,
      setOnClearFilters,
    }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter() {
  const context = useContext(FilterContext);
  if (context === undefined) {
    throw new Error('useFilter must be used within a FilterProvider');
  }
  return context;
} 