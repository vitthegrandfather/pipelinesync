export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-border bg-surface px-6 py-12 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-md border border-danger/20 bg-danger-muted px-4 py-3 text-sm text-danger">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="mt-2 font-medium underline" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className = "h-4" }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-surface-muted ${className}`} />;
}
