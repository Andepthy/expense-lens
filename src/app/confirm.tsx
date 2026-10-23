import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { Button, Dialog } from 'material/react';

export interface ConfirmOptions {
  title?: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirmation {
  options: ConfirmOptions;
  resolve: (accepted: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setPending((current) => {
          current?.resolve(false);
          return { options, resolve };
        });
      }),
    [],
  );

  const settle = (accepted: boolean) => {
    setPending((current) => {
      current?.resolve(accepted);
      return null;
    });
  };

  const options = pending?.options;
  const danger = options?.tone === 'danger';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? (
        <Dialog
          open
          size="small"
          headline={options?.title ?? '请确认'}
          onClose={() => settle(false)}
          actions={
            <>
              <Button variant="text" onClick={() => settle(false)}>
                {options?.cancelLabel ?? '取消'}
              </Button>
              <Button
                variant={danger ? 'text' : 'filled'}
                className={danger ? 'danger-action' : undefined}
                onClick={() => settle(true)}
              >
                {options?.confirmLabel ?? '确认'}
              </Button>
            </>
          }
        >
          <div className="dialog-content">
            <p>{options?.message}</p>
            {options?.detail ? <p className="muted">{options.detail}</p> : null}
            {danger ? <p className="dialog-danger-note">此操作不可撤销。</p> : null}
          </div>
        </Dialog>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const value = useContext(ConfirmContext);
  if (!value) throw new Error('useConfirm must be used inside ConfirmProvider');
  return value;
}

export { ConfirmContext };
