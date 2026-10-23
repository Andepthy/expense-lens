import { ConfirmProvider } from './app/confirm';
import { ExpenseLensRoot } from './app/ExpenseLensProvider';
import { AppShell } from './app/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <ConfirmProvider>
        <ExpenseLensRoot>
          <AppShell />
        </ExpenseLensRoot>
      </ConfirmProvider>
    </ErrorBoundary>
  );
}
