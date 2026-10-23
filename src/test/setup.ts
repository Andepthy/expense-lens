import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount Material elements before jsdom tears its window down: the text-field
// placement feature removes a window listener during destroy.
afterEach(() => cleanup());

/**
 * jsdom implements custom elements and shadow DOM, but not the browser APIs
 * Material's elements use for top-layer surfaces. These are test-only shims;
 * the Windows WebView2 acceptance run exercises the real implementations.
 */
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

if (!window.ResizeObserver) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

// jsdom has no canvas implementation and logs a not-implemented error. The
// loading indicator treats a null 2D context as "draw nothing", so returning
// null keeps the component mounted without pretending canvas drawing works.
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function getContext(
  this: HTMLCanvasElement,
  contextId: string,
  ...args: unknown[]
) {
  if (contextId === '2d') return null;
  return (originalGetContext as (...params: unknown[]) => unknown).call(this, contextId, ...args);
} as typeof HTMLCanvasElement.prototype.getContext;

if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.show) {
    HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
  }
}

if (!HTMLElement.prototype.showPopover) {
  HTMLElement.prototype.showPopover = function showPopover() {
    this.setAttribute('data-test-popover-open', '');
  };
}
if (!HTMLElement.prototype.hidePopover) {
  HTMLElement.prototype.hidePopover = function hidePopover() {
    this.removeAttribute('data-test-popover-open');
  };
}

/**
 * jsdom 26 creates an ElementInternals object but leaves the form-association
 * API empty. Material's form controls call setFormValue/setValidity while their
 * shadow tree is built, so an unshimmed run throws before anything renders.
 */
const internalsPrototype = window.ElementInternals?.prototype as
  | (ElementInternals & Record<string, unknown>)
  | undefined;

if (internalsPrototype) {
  const validity = {
    badInput: false,
    customError: false,
    patternMismatch: false,
    rangeOverflow: false,
    rangeUnderflow: false,
    stepMismatch: false,
    tooLong: false,
    tooShort: false,
    typeMismatch: false,
    valid: true,
    valueMissing: false,
  } as ValidityState;

  const define = (name: string, value: unknown) => {
    if (!(name in internalsPrototype)) {
      Object.defineProperty(internalsPrototype, name, {
        configurable: true,
        get: () => value,
      });
    }
  };

  if (!internalsPrototype.setFormValue) {
    internalsPrototype.setFormValue = () => undefined;
  }
  if (!internalsPrototype.setValidity) {
    internalsPrototype.setValidity = () => undefined;
  }
  if (!internalsPrototype.checkValidity) {
    internalsPrototype.checkValidity = () => true;
  }
  if (!internalsPrototype.reportValidity) {
    internalsPrototype.reportValidity = () => true;
  }
  define('validity', validity);
  define('form', null);
  define('labels', []);
  define('willValidate', true);
  define('validationMessage', '');
}
