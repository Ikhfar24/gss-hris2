export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 border-b border-border pb-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <h1 className="break-words text-page-title text-brand [overflow-wrap:anywhere]">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-3xl text-body text-muted">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
