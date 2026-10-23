import { createContext, useContext, type ReactNode } from 'react';
import { useExpenseLens } from '../services/useExpenseLens';
import { useConfirm } from './confirm';

export type ExpenseLensValue = ReturnType<typeof useExpenseLens>;

export const ExpenseLensContext = createContext<ExpenseLensValue | null>(null);

/**
 * The application owns exactly one useExpenseLens instance. Pages read that
 * shared state through context, so imports, rules and dashboard filters can
 * never diverge across independent hook instances.
 */
export function ExpenseLensRoot({ children }: { children: ReactNode }) {
  const confirm = useConfirm();
  const lens = useExpenseLens({
    confirm: (message) =>
      confirm({
        title: '请确认',
        message,
        confirmLabel: '继续',
      }),
  });

  return <ExpenseLensContext.Provider value={lens}>{children}</ExpenseLensContext.Provider>;
}

export function useLens(): ExpenseLensValue {
  const value = useContext(ExpenseLensContext);
  if (!value) throw new Error('useLens must be used inside ExpenseLensRoot');
  return value;
}
