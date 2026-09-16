import { Skeleton } from '@/src/components/app/Skeleton';

type DashboardHomeSkeletonProps = {
  showBudget?: boolean;
};

const TREND_BAR_HEIGHTS = ['h-[38%]', 'h-[62%]', 'h-[28%]', 'h-[74%]', 'h-[46%]', 'h-[68%]', 'h-[40%]'] as const;

export function DashboardHomeSkeleton({ showBudget = true }: DashboardHomeSkeletonProps) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-8">
      <p className="sr-only">Caricamento dashboard</p>

      <div className="space-y-3 md:space-y-4">
        <div className="grid grid-cols-2 items-stretch gap-3 md:gap-4">
          <TotalCardSkeleton compact={showBudget} />
          {showBudget ? <BudgetCardSkeleton /> : null}
          <DistributionCardSkeleton />
        </div>
        <Last7DaysCardSkeleton />
      </div>

      <RecentActivitySkeleton />
    </div>
  );
}

function HomeCardIconBone() {
  return <Skeleton className="h-8 w-8 rounded-lg md:h-9 md:w-9" />;
}

function TotalCardSkeleton({ compact }: { compact: boolean }) {
  return (
    <div
      className={`card flex h-full min-w-0 w-full flex-col p-3 md:p-4${compact ? '' : ' col-span-2 md:col-span-1'}`}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1 md:gap-x-3">
        <HomeCardIconBone />
        <div className="flex min-w-0 items-start justify-between gap-1">
          <Skeleton className="mt-0.5 h-4 w-24" />
          <Skeleton className="mt-0.5 size-4 shrink-0 rounded md:size-[18px]" />
        </div>
        <div className="col-span-2 min-w-0 md:col-span-1">
          <Skeleton className="h-7 w-28 md:h-9 md:w-36" />
          <Skeleton className="mt-1 h-3 w-36 md:h-3.5" />
        </div>
      </div>
    </div>
  );
}

function BudgetCardSkeleton() {
  return (
    <div className="flex h-full min-w-0 w-full flex-col">
      <div className="card flex h-full min-w-0 w-full flex-col p-3 md:p-4">
        <div className="grid h-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1 md:gap-x-3">
          <HomeCardIconBone />
          <div className="flex min-w-0 items-start justify-between gap-1">
            <Skeleton className="mt-0.5 h-4 w-24" />
          </div>
          <div className="col-span-2 min-w-0 md:col-span-1">
            <BudgetLoadingBones />
          </div>
        </div>
      </div>
    </div>
  );
}

function BudgetLoadingBones() {
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-1.5 gap-y-0.5">
        <Skeleton className="h-4 w-20 md:h-[1.125rem]" />
        <Skeleton className="h-5 w-16 md:h-6" />
      </div>
      <Skeleton className="mt-1.5 h-2.5 w-full rounded-full md:h-3" />
      <Skeleton className="mt-1 h-3 w-28 md:mt-1.5 md:h-3.5" />
    </>
  );
}

function DistributionCardSkeleton() {
  return (
    <div className="card col-span-2 flex min-w-0 w-full flex-col p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <HomeCardIconBone />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-7 w-[9.5rem] rounded-lg" />
      </div>

      <div className="mt-3 flex min-w-0 items-center gap-3 md:gap-5">
        <div className="relative isolate h-[132px] w-[132px] shrink-0 sm:h-[148px] sm:w-[148px]">
          <Skeleton className="absolute inset-0 rounded-full" />
          <div className="absolute inset-[19%] rounded-full bg-surface" />
        </div>
        <ul className="grid min-h-[8.75rem] min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto_auto] content-center gap-x-2 gap-y-2">
          {Array.from({ length: 4 }, (_, index) => (
            <li key={index} className="col-span-4 grid min-w-0 grid-cols-subgrid items-center">
              <Skeleton className="size-2.5 rounded-full" />
              <Skeleton className="h-3.5 w-[72%]" />
              <Skeleton className="h-3.5 w-14" />
              <Skeleton className="ml-3 h-3 w-8" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Last7DaysCardSkeleton() {
  return (
    <div className="card min-w-0 w-full p-3 md:p-4">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <HomeCardIconBone />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="mt-3 flex h-48 w-full min-w-0 items-end justify-between gap-2 px-8 pb-5">
        {TREND_BAR_HEIGHTS.map((heightClass, index) => (
          <div key={index} className={`w-full max-w-9 ${heightClass}`}>
            <Skeleton className="h-full w-full rounded-t-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentActivitySkeleton() {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="card flex items-center justify-between p-4">
            <div className="flex min-w-0 items-center gap-4">
              <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-4 w-32 sm:w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-4 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </section>
  );
}
