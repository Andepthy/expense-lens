import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { ConfirmContext, type ConfirmFn } from '../app/confirm';
import { ExpenseLensContext, type ExpenseLensValue } from '../app/ExpenseLensProvider';
import { createMockLens } from './lens';

export function renderWithLens(
  ui: ReactElement,
  overrides: Partial<ExpenseLensValue> = {},
  confirm: ConfirmFn = vi.fn(async () => true) as unknown as ConfirmFn,
) {
  const lens = createMockLens(overrides);
  const view = render(
    <ConfirmContext.Provider value={confirm}>
      <ExpenseLensContext.Provider value={lens}>{ui}</ExpenseLensContext.Provider>
    </ConfirmContext.Provider>,
  );
  return { ...view, lens, confirm };
}
