import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { NoticeSnackbar } from './states';

describe('NoticeSnackbar', () => {
  it('passes the hook notice to the Material snackbar and opens it', () => {
    const { container } = render(
      <NoticeSnackbar notice={{ message: '交易已更新。', tone: 'success' }} />,
    );
    const snackbar = container.querySelector('m-snackbar');
    expect(snackbar).not.toBeNull();
    expect(snackbar?.getAttribute('message')).toBe('交易已更新。');
  });
});
