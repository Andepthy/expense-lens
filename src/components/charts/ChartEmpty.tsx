import { Inbox } from 'lucide-react';

export function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="chart-empty" role="status">
      <Inbox size={24} aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
