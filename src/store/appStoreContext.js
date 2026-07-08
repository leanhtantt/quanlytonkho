import { createContext, useContext } from 'react';

export const StoreContext = createContext();

export function useAppStore() {
  return useContext(StoreContext);
}

