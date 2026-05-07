type ExpensesLoadErrorBannerProps = {
  message: string;
};

export function ExpensesLoadErrorBanner({ message }: ExpensesLoadErrorBannerProps) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert">
      <p>{message}</p>
    </div>
  );
}
