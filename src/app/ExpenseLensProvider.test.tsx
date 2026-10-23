import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createMockLens } from '../test/lens';
import { ConfirmProvider } from './confirm';
import { ExpenseLensRoot, useLens, type ExpenseLensValue } from './ExpenseLensProvider';

const useExpenseLensMock = vi.hoisted(() => vi.fn());

vi.mock('../services/useExpenseLens', () => ({
  useExpenseLens: useExpenseLensMock,
}));

const seen: ExpenseLensValue[] = [];

function Probe() {
  const lens = useLens();
  seen.push(lens);
  return <span>{lens.info?.transactionCount ?? 0}</span>;
}

beforeEach(() => {
  seen.length = 0;
  useExpenseLensMock.mockReset();
  useExpenseLensMock.mockImplementation(() => createMockLens());
});

describe('ExpenseLensRoot', () => {
  it('creates one business state instance and shares the same object with every page', () => {
    render(
      <ConfirmProvider>
        <ExpenseLensRoot>
          <Probe />
          <Probe />
        </ExpenseLensRoot>
      </ConfirmProvider>,
    );

    expect(useExpenseLensMock).toHaveBeenCalled();
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
  });
});
