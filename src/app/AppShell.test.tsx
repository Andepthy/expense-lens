import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithLens } from '../test/render';
import { clickHost, fireDetail } from '../test/materialEvents';
import { AppShell } from './AppShell';

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.themeMode;
  delete document.documentElement.dataset.theme;
});

describe('AppShell', () => {
  it('renders a consistent rail, app bar and dashboard page', () => {
    renderWithLens(<AppShell />);

    expect(document.querySelectorAll('m-navigation-rail-item')).toHaveLength(5);
    expect(document.querySelector('m-navigation-rail-item[value="dashboard"]')?.getAttribute('label')).toBe('概览');
    expect(document.querySelector('m-navigation-rail-item[value="transactions"]')?.getAttribute('badge')).toBe('2');
    expect(document.querySelector('m-top-app-bar')?.getAttribute('headline')).toBe('概览');
    expect(screen.getByRole('heading', { level: 1, name: '概览' })).toBeInTheDocument();
    expect(document.body.textContent).toContain('3 笔交易');
  });

  it('switches pages through the navigation rail event and updates the title', () => {
    renderWithLens(<AppShell />);
    const rail = document.querySelector('m-navigation-rail');
    expect(rail).not.toBeNull();
    fireDetail(rail!, 'change', { value: 'transactions' });

    expect(document.querySelector('m-top-app-bar')?.getAttribute('headline')).toBe('交易明细');
    expect(screen.getByRole('heading', { level: 1, name: '交易明细' })).toBeInTheDocument();
    expect(document.body.textContent).toContain('交易列表');
    expect(document.title).toBe('交易明细 · Expense Lens');
  });

  it('toggles the official baseline light/dark mode and refreshes through the app bar', () => {
    const { lens } = renderWithLens(<AppShell />);
    const darkToggle = document.querySelector('m-icon-button[aria-label="切换到深色模式"]');
    expect(darkToggle).not.toBeNull();
    clickHost(darkToggle!);
    expect(document.documentElement.dataset.theme).toBe('baseline');
    expect(document.documentElement.dataset.themeMode).toBe('dark');

    const lightToggle = document.querySelector('m-icon-button[aria-label="切换到浅色模式"]');
    expect(lightToggle).not.toBeNull();

    const refresh = document.querySelector('m-icon-button[aria-label="刷新数据"]');
    expect(refresh).not.toBeNull();
    clickHost(refresh!);
    expect(lens.refresh).toHaveBeenCalledTimes(1);
  });

  it('uses the system color scheme when no theme preference has been saved', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);

    renderWithLens(<AppShell />);

    expect(document.documentElement.dataset.themeMode).toBe('dark');
  });

  it('keeps a saved theme preference over the system color scheme', () => {
    window.localStorage.setItem('expense-lens.theme-mode', 'light');
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);

    renderWithLens(<AppShell />);

    expect(document.documentElement.dataset.themeMode).toBeUndefined();
  });

  it('keeps the transactions intent when the dashboard opens pending records', () => {
    renderWithLens(<AppShell />);
    const pending = [...document.querySelectorAll('m-button')].find(
      (button) => button.textContent?.trim() === '查看待处理',
    );
    expect(pending).toBeDefined();
    clickHost(pending!);
    expect(document.querySelector('m-top-app-bar')?.getAttribute('headline')).toBe('交易明细');
    expect(document.body.textContent).toContain('待确认');
  });
});
