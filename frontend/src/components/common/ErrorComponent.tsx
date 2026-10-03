import { Button } from '@/components/ui/button';

interface ErrorComponentProps {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorComponent({
  message = 'Something went wrong.',
  onRetry,
}: ErrorComponentProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 p-8 text-center"
    >
      <p className="text-sm text-destructive">{message}</p>
      {onRetry && (
        <Button variant="secondary" type="button" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
