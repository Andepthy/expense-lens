import { fireEvent } from '@testing-library/react';

/** Dispatch the custom-element event Material's React adapter listens for. */
export function fireDetail(element: Element, type: string, detail: unknown): void {
  fireEvent(
    element,
    new CustomEvent(type, {
      detail,
      bubbles: true,
      composed: true,
    }),
  );
}

export function clickHost(element: Element): void {
  fireEvent.click(element);
}

export function queryField(container: ParentNode, label: string): Element {
  const element = container.querySelector(`m-text-field[label="${label}"]`);
  if (!element) throw new Error(`text field not found: ${label}`);
  return element;
}

export function querySelect(container: ParentNode, label: string): Element {
  const element = container.querySelector(`m-select[label="${label}"]`);
  if (!element) throw new Error(`select not found: ${label}`);
  return element;
}
