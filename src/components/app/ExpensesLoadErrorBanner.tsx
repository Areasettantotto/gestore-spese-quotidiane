type ExpensesLoadErrorBannerProps = {
  message: string;
};

export function ExpensesLoadErrorBanner({ message }: ExpensesLoadErrorBannerProps) {
  return (
    <div className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-text-primary" role="alert">
      <p>{message}</p>
    </div>
  );
}
