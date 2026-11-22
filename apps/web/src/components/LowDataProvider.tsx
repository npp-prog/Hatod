'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

const KEY = 'hatod.lowData';
const Ctx = createContext<{ lowData: boolean; setLowData: (on: boolean) => void }>({ lowData: false, setLowData: () => {} });

/**
 * Low data mode hides food and shop photos. On by default when the browser
 * says the user asked to save data (Android "Data saver").
 */
export function LowDataProvider({ children }: { children: ReactNode }) {
  const [lowData, setState] = useState(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored !== null) return setState(stored === '1');
    } catch {
      /* ignore */
    }
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) setState(true);
  }, []);
  const setLowData = useCallback((on: boolean) => {
    setState(on);
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);
  return <Ctx.Provider value={{ lowData, setLowData }}>{children}</Ctx.Provider>;
}

export const useLowData = () => useContext(Ctx);
