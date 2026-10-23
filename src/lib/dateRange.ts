export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  return {
    start: localDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

export function isValidRange(start: string, end: string): boolean {
  return Boolean(start && end && start <= end);
}
