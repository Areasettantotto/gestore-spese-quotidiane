/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { format, startOfMonth, endOfMonth, lastDayOfMonth, setDate, subMonths } from 'date-fns';
import { it } from 'date-fns/locale';

import { type Expense } from './types';
import { supabase } from './lib/supabaseClient';
import { buildLast7DaysTrend } from '@/src/features/expenses/last7DaysTrend';
import type { CategoryCode } from '@/src/features/expenses/expenseCategoryCatalog';
import {
  deriveExpenseCompanionSelector,
  expenseCompanionFilterChoices,
  expenseMatchesCompanionFilter,
  resolveSubmittedExpenseCompanion,
} from '@/src/features/expenses/expenses.mapper';
import {
  emptyExpenseFormDraft,
  type ExpenseCompanionFilter,
  type ExpenseFormData,
  type ExpenseWithCategoryCode,
} from '@/src/features/expenses/expenses.types';
import { useExpenses } from '@/src/features/expenses/useExpenses';
import { useExpenseCompanionRead } from '@/src/features/companions/useExpenseCompanionRead';
import { useActiveTenant } from '@/src/features/tenancy/useActiveTenant';
import { currentCalendarMonthStartDate } from '@/src/features/budgets/monthlyBudgets';
import { useCurrentMonthlyBudget } from '@/src/features/budgets/useCurrentMonthlyBudget';
import {
  useEffectiveAccess,
  type UseEffectiveAccessResult,
} from '@/src/features/billing/useEffectiveAccess';
import { AppHeader } from '@/src/components/app/AppHeader';
import { BottomNavigation } from '@/src/components/app/BottomNavigation';
import { DesktopSidebar } from '@/src/components/app/DesktopSidebar';
import { WorkspaceLoadingState } from '@/src/components/app/WorkspaceLoadingState';
import { WorkspaceUnavailableState } from '@/src/components/app/WorkspaceUnavailableState';
import { ExpensesLoadErrorBanner } from '@/src/components/app/ExpensesLoadErrorBanner';
import { SummaryCards } from '@/src/components/app/SummaryCards';
import { RecentExpensesList } from '@/src/components/app/RecentExpensesList';
import { DashboardHomeSkeleton } from '@/src/components/app/home/DashboardHomeSkeleton';
import { ExpenseForm } from '@/src/components/app/ExpenseForm';
import { AllExpensesView } from '@/src/components/app/AllExpensesView';
import { SettingsView } from '@/src/components/app/SettingsView';

type ViewMode = 'home' | 'all' | 'settings';

type AccessPresentation = {
  badgeLabel: string | null;
  accountTier: 'base' | 'pro' | null;
  giftLabel: 'Gift' | null;
};

function comparablePreviousPeriodEnd(today: Date): Date {
  const previousMonthStart = startOfMonth(subMonths(today, 1));
  const lastDayPrevious = lastDayOfMonth(previousMonthStart);
  if (today.getDate() > lastDayPrevious.getDate()) {
    return lastDayPrevious;
  }
  return setDate(previousMonthStart, today.getDate());
}

function expensesBetween<T extends Expense>(
  expenses: readonly T[],
  fromDate: string,
  toDate: string
): T[] {
  return expenses.filter((expense) => expense.date >= fromDate && expense.date <= toDate);
}

function sumExpenses(expenses: Expense[]): number {
  return expenses.reduce((acc, curr) => acc + curr.amount, 0);
}

function sumExpensesBetween(expenses: Expense[], fromDate: string, toDate: string): number {
  return sumExpenses(expensesBetween(expenses, fromDate, toDate));
}

const COMPANION_SUBMIT_LOADING_MESSAGE =
  'Attendi il completamento del caricamento degli Accompagnatori e riprova.';
const COMPANION_SUBMIT_UNCONFIRMED_MESSAGE =
  "L'assegnazione dell'Accompagnatore non può essere confermata.";

function expenseCompanionAssignmentPending(params: {
  isEditing: boolean;
  draftCompanionId: string | null;
  originalCompanionId: string | null;
  writable: boolean;
  options: readonly { id: string }[];
}): boolean {
  if (!params.writable) {
    if (!params.isEditing) return params.draftCompanionId != null;
    return params.draftCompanionId !== params.originalCompanionId;
  }

  if (params.draftCompanionId == null) return false;
  if (params.isEditing && params.draftCompanionId === params.originalCompanionId) return false;
  return !params.options.some((option) => option.id === params.draftCompanionId);
}

function accessPresentationFromEffectiveAccess(access: UseEffectiveAccessResult): AccessPresentation {
  if (access.status !== 'success') {
    return { badgeLabel: null, accountTier: null, giftLabel: null };
  }

  const payload = access.data;
  if (payload.status !== 'granted') {
    return { badgeLabel: null, accountTier: null, giftLabel: null };
  }

  switch (payload.mode) {
    case 'standard':
      return {
        badgeLabel: payload.tier === 'base' ? 'Piano Base' : 'Piano Pro',
        accountTier: payload.tier,
        giftLabel: payload.source === 'complimentary' ? 'Gift' : null,
      };
    case 'internal':
      return { badgeLabel: 'Admin', accountTier: null, giftLabel: null };
    case 'demo':
      return { badgeLabel: 'Demo', accountTier: null, giftLabel: null };
  }
}

export default function App() {
  const [view, setView] = useState<ViewMode>('home');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const {
    activeTenantId,
    membershipRole,
    isTenantContextLoading,
    tenantError,
    loadDefaultTenant,
    resolveTenantForMutation,
    resetTenantState,
  } = useActiveTenant();

  const [companionSettingsRefresh, setCompanionSettingsRefresh] = useState<{
    tenantId: string;
    key: number;
  } | null>(null);

  const handleCompanionsEnabledUpdated = useCallback((tenantId: string) => {
    setCompanionSettingsRefresh((current) => ({
      tenantId,
      key: current?.tenantId === tenantId ? current.key + 1 : 1,
    }));
  }, []);

  const companionSettingsRefreshKey =
    companionSettingsRefresh != null && companionSettingsRefresh.tenantId === activeTenantId
      ? companionSettingsRefresh.key
      : 0;

  const expenseCompanionRead = useExpenseCompanionRead({
    activeTenantId,
    membershipRole,
    isTenantContextLoading,
    settingsRefreshKey: companionSettingsRefreshKey,
  });

  const effectiveAccess = useEffectiveAccess({
    activeTenantId,
    isTenantContextLoading,
  });
  const { badgeLabel: accessBadgeLabel, accountTier, giftLabel } = accessPresentationFromEffectiveAccess(effectiveAccess);
  const isAccessLoading = effectiveAccess.status === 'loading';

  const { expenses, expensesLoadError, isInitialLoading, initialLoadStatus, saveExpense, deleteExpense } = useExpenses({
    userId,
    activeTenantId,
    isTenantContextLoading,
    resolveTenantForMutation,
  });

  const now = new Date();
  const periodMonth = currentCalendarMonthStartDate(now);
  const currentMonthName = format(now, 'MMMM', { locale: it });

  const currentMonthlyBudget = useCurrentMonthlyBudget({
    activeTenantId,
    isTenantContextLoading,
    membershipRole,
    periodMonth,
  });

  const [filterMonth, setFilterMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [filterCategory, setFilterCategory] = useState<CategoryCode | 'all'>('all');
  const [companionFilter, setCompanionFilter] = useState<ExpenseCompanionFilter>({ kind: 'all' });
  const [filterSearch, setFilterSearch] = useState('');

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isExpenseSubmitting, setIsExpenseSubmitting] = useState(false);
  const [expenseCompanionSubmitError, setExpenseCompanionSubmitError] = useState<string | null>(null);
  const expenseSubmitLockRef = useRef(false);
  const expenseFormSessionRef = useRef(0);
  const expenseFormContextRef = useRef<{
    userId: string | null;
    activeTenantId: string | null;
  } | null>(null);
  const expensesScrollYRef = useRef(0);
  const [newExpense, setNewExpense] = useState<ExpenseFormData>(() =>
    emptyExpenseFormDraft(format(new Date(), 'yyyy-MM-dd')),
  );

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (user && mounted) {
        setUserEmail(user.email ?? null);
        setUserId(user.id);
        await loadDefaultTenant(user.id);
      }
    };

    void init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUserEmail(session.user.email ?? null);
        setUserId(session.user.id);
        void loadDefaultTenant(session.user.id);
      } else {
        setUserEmail(null);
        setUserId(null);
        resetTenantState();
      }
    });

    return () => {
      mounted = false;
      try {
        sub.subscription.unsubscribe();
      } catch (_) {}
    };
  }, [loadDefaultTenant, resetTenantState]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUserEmail(null);
    setUserId(null);
    resetTenantState();
  };

  const { currentMonthExpenses, totalMonthly, currentPeriodTotal, previousComparablePeriodTotal, previousMonthName } =
    useMemo(() => {
      const currentStart = periodMonth;
      const currentEnd = format(now, 'yyyy-MM-dd');
      const currentMonthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
      const previousStartDate = startOfMonth(subMonths(now, 1));
      const previousStart = format(previousStartDate, 'yyyy-MM-dd');
      const previousEnd = format(comparablePreviousPeriodEnd(now), 'yyyy-MM-dd');
      const currentMonthExpenses = expensesBetween(expenses, currentStart, currentMonthEnd);

      return {
        currentMonthExpenses,
        totalMonthly: sumExpenses(currentMonthExpenses),
        currentPeriodTotal: sumExpensesBetween(expenses, currentStart, currentEnd),
        previousComparablePeriodTotal: sumExpensesBetween(expenses, previousStart, previousEnd),
        previousMonthName: format(previousStartDate, 'MMMM', { locale: it }),
      };
    }, [expenses, periodMonth]);

  const readyCompanionItems =
    expenseCompanionRead.status === 'ready' ? expenseCompanionRead.items : null;

  const companionDisplayNamesById = useMemo(() => {
    if (readyCompanionItems == null || expenseCompanionRead.companionsEnabled !== true) {
      return null;
    }

    const lookup = new Map<string, string>();
    for (const companion of readyCompanionItems) {
      lookup.set(companion.id, companion.displayName);
    }
    return lookup;
  }, [readyCompanionItems, expenseCompanionRead.companionsEnabled]);

  const companionFilterChoices = useMemo(
    () =>
      expenseCompanionFilterChoices({
        expenses,
        catalog: readyCompanionItems,
      }),
    [expenses, readyCompanionItems],
  );

  const recentExpenses = useMemo(() => {
    return [...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
  }, [expenses]);

  const companionFilterVisible =
    expenseCompanionRead.status === 'ready' && expenseCompanionRead.companionsEnabled === true;

  const filteredExpenses = useMemo(() => {
    const appliedCompanionFilter = companionFilterVisible ? companionFilter : { kind: 'all' as const };
    return expenses
      .filter((e) => {
        const matchesMonth = e.date.startsWith(filterMonth);
        const matchesCategory = filterCategory === 'all' || e.categoryCode === filterCategory;
        const matchesSearch = e.description.toLowerCase().includes(filterSearch.toLowerCase());
        const matchesCompanion = expenseMatchesCompanionFilter(e.companionId, appliedCompanionFilter);
        return matchesMonth && matchesCategory && matchesSearch && matchesCompanion;
      })
      .sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateB !== dateA) return dateB - dateA;
        return a.description.localeCompare(b.description);
      });
  }, [expenses, filterMonth, filterCategory, filterSearch, companionFilter, companionFilterVisible]);

  const filteredTotal = useMemo(() => {
    return filteredExpenses.reduce((acc, curr) => acc + curr.amount, 0);
  }, [filteredExpenses]);

  const last7DaysTrend = useMemo(() => buildLast7DaysTrend(expenses), [expenses]);
  const last7DaysExpenses = useMemo(() => {
    const dateKeys = new Set(last7DaysTrend.map((point) => point.dateKey));
    return expenses.filter((expense) => dateKeys.has(expense.date));
  }, [expenses, last7DaysTrend]);

  const editingExpense = useMemo(() => {
    if (editingId == null) return null;
    return expenses.find((expense) => expense.id === editingId) ?? null;
  }, [editingId, expenses]);

  const existingCompanionId = editingExpense ? (editingExpense.companionId ?? null) : null;

  const companionSelector = useMemo(
    () =>
      deriveExpenseCompanionSelector({
        status: expenseCompanionRead.status,
        companionsEnabled: expenseCompanionRead.companionsEnabled,
        items: expenseCompanionRead.items,
        existingCompanionId,
      }),
    [
      expenseCompanionRead.status,
      expenseCompanionRead.companionsEnabled,
      expenseCompanionRead.items,
      existingCompanionId,
    ],
  );

  const draftCompanionTenantIdRef = useRef(activeTenantId);
  const companionFilterTenantIdRef = useRef(activeTenantId);

  useEffect(() => {
    const tenantChanged = companionFilterTenantIdRef.current !== activeTenantId;
    if (tenantChanged) {
      companionFilterTenantIdRef.current = activeTenantId;
      setCompanionFilter((current) => (current.kind === 'all' ? current : { kind: 'all' }));
      return;
    }

    // Same-tenant reload only. Confirmed OFF still clears below.
    if (expenseCompanionRead.status === 'loading') return;

    if (expenseCompanionRead.status === 'ready' && expenseCompanionRead.companionsEnabled === false) {
      setCompanionFilter((current) => (current.kind === 'all' ? current : { kind: 'all' }));
    }
  }, [activeTenantId, expenseCompanionRead.status, expenseCompanionRead.companionsEnabled]);

  useEffect(() => {
    const tenantChanged = draftCompanionTenantIdRef.current !== activeTenantId;
    if (tenantChanged) {
      draftCompanionTenantIdRef.current = activeTenantId;
      setNewExpense((current) =>
        current.companionId == null ? current : { ...current, companionId: null },
      );
      return;
    }

    // Same-tenant reload only. A settled denial still clears below.
    if (expenseCompanionRead.status === 'loading') return;

    if (companionSelector.writable) return;

    if (editingId == null) {
      setNewExpense((current) =>
        current.companionId == null ? current : { ...current, companionId: null },
      );
      return;
    }

    setNewExpense((current) =>
      current.companionId === existingCompanionId
        ? current
        : { ...current, companionId: existingCompanionId },
    );
  }, [
    activeTenantId,
    expenseCompanionRead.status,
    companionSelector.writable,
    editingId,
    existingCompanionId,
  ]);

  const companionAssignmentPending = expenseCompanionAssignmentPending({
    isEditing: editingId != null,
    draftCompanionId: newExpense.companionId,
    originalCompanionId: existingCompanionId,
    writable: companionSelector.writable,
    options: companionSelector.options,
  });

  useEffect(() => {
    if (!isAdding || !companionAssignmentPending) {
      setExpenseCompanionSubmitError(null);
    }
  }, [isAdding, companionAssignmentPending]);

  const resetExpenseDraft = () => {
    setEditingId(null);
    setNewExpense(emptyExpenseFormDraft(format(new Date(), 'yyyy-MM-dd')));
  };

  const discardExpenseFormSession = () => {
    expenseFormSessionRef.current += 1;
    setIsAdding(false);
    resetExpenseDraft();
    setExpenseCompanionSubmitError(null);
  };

  useLayoutEffect(() => {
    const nextContext = { userId, activeTenantId };
    const previousContext = expenseFormContextRef.current;
    expenseFormContextRef.current = nextContext;
    if (previousContext == null) return;
    if (
      previousContext.userId === nextContext.userId &&
      previousContext.activeTenantId === nextContext.activeTenantId
    ) {
      return;
    }
    discardExpenseFormSession();
  }, [userId, activeTenantId]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();

    const rawAmount = newExpense.amount;
    const amountNum = typeof rawAmount === 'number' ? rawAmount : Number(String(rawAmount ?? '').replace(',', '.'));

    if (!newExpense.description || !newExpense.date || !newExpense.categoryCode) return;
    if (isNaN(amountNum) || amountNum <= 0) return;

    if (
      expenseCompanionAssignmentPending({
        isEditing: editingId != null,
        draftCompanionId: newExpense.companionId,
        originalCompanionId: existingCompanionId,
        writable: companionSelector.writable,
        options: companionSelector.options,
      })
    ) {
      setExpenseCompanionSubmitError(
        expenseCompanionRead.status === 'loading'
          ? COMPANION_SUBMIT_LOADING_MESSAGE
          : COMPANION_SUBMIT_UNCONFIRMED_MESSAGE,
      );
      return;
    }

    if (expenseSubmitLockRef.current) return;
    expenseSubmitLockRef.current = true;
    setIsExpenseSubmitting(true);
    const ownedExpenseFormSession = expenseFormSessionRef.current;

    try {
      if (editingId != null && editingExpense == null) {
        console.error('Cannot update expense companion because the original expense is no longer loaded');
        return;
      }

      const companionWrite = resolveSubmittedExpenseCompanion({
        mode: editingId == null ? 'create' : 'update',
        writable: companionSelector.writable,
        options: companionSelector.options,
        draftCompanionId: newExpense.companionId,
        originalCompanionId: existingCompanionId,
      });
      if (!companionWrite) {
        console.error('Rejected expense companion selection outside the writable option set');
        return;
      }

      const saveResult = await saveExpense({
        amount: amountNum,
        categoryCode: newExpense.categoryCode,
        description: newExpense.description,
        date: newExpense.date,
        companionId: companionWrite.companionId,
        editingId,
      });
      if (expenseFormSessionRef.current !== ownedExpenseFormSession) {
        return;
      }
      if (!saveResult || saveResult.error !== null) {
        return;
      }

      setIsAdding(false);
      resetExpenseDraft();
    } finally {
      expenseSubmitLockRef.current = false;
      setIsExpenseSubmitting(false);
    }
  };

  const handleEditClick = (expense: ExpenseWithCategoryCode) => {
    setNewExpense({
      amount: expense.amount,
      categoryCode: expense.categoryCode,
      description: expense.description,
      date: expense.date,
      companionId: expense.companionId ?? null,
    });
    setEditingId(expense.id);
    setIsAdding(true);
  };

  const handleConfirmedDeleteExpense = (expense: Expense) => {
    void deleteExpense(expense.id);
  };

  const rememberExpensesScroll = () => {
    if (view === 'all') {
      expensesScrollYRef.current = window.scrollY;
    }
  };

  const navigateToHome = () => {
    rememberExpensesScroll();
    setView('home');
  };

  const navigateToExpenses = () => {
    setView('all');
  };

  const navigateToSettings = () => {
    rememberExpensesScroll();
    setView('settings');
  };

  useLayoutEffect(() => {
    expensesScrollYRef.current = 0;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeTenantId]);

  useLayoutEffect(() => {
    if (view === 'all') {
      window.scrollTo({ top: expensesScrollYRef.current, behavior: 'auto' });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [view]);

  return (
    <div className="min-h-screen pb-28 lg:pb-0">
      <DesktopSidebar
        activeView={view}
        onHome={navigateToHome}
        onExpenses={navigateToExpenses}
        onSettings={navigateToSettings}
      />

      <div className="lg:pl-64">
        <AppHeader
          dateLabel={format(new Date(), 'EEEE d MMMM', { locale: it })}
          userEmail={userEmail}
          addDisabled={!userId || !activeTenantId || isTenantContextLoading}
          isAccessLoading={isAccessLoading}
          accessBadgeLabel={accessBadgeLabel}
          accountTier={accountTier}
          giftLabel={giftLabel}
          onAdd={() => setIsAdding(true)}
          onSignOut={handleSignOut}
        />

        <main className="max-w-2xl mx-auto px-4 pt-4 pb-8 md:pt-8 space-y-8">
          {view !== 'settings' && userId && activeTenantId && expensesLoadError ? <ExpensesLoadErrorBanner message={expensesLoadError} /> : null}
          {view === 'settings' ? (
            <SettingsView
              onBack={navigateToHome}
              activeTenantId={activeTenantId}
              membershipRole={membershipRole}
              isTenantContextLoading={isTenantContextLoading}
              onCompanionsEnabledUpdated={handleCompanionsEnabledUpdated}
            />
          ) : (
            <>
              {userId && isTenantContextLoading ? <WorkspaceLoadingState /> : null}
              {userId && !isTenantContextLoading && !activeTenantId ? (
                <WorkspaceUnavailableState tenantError={tenantError} />
              ) : null}
            </>
          )}

          {userId && !isTenantContextLoading && activeTenantId ? (
            <>
              {view === 'home' ? (
                isInitialLoading ? (
                  <DashboardHomeSkeleton showBudget={currentMonthlyBudget.status !== 'hidden'} />
                ) : initialLoadStatus === 'success' ? (
                  <>
                    <SummaryCards
                      totalMonthly={totalMonthly}
                      currentPeriodTotal={currentPeriodTotal}
                      previousComparablePeriodTotal={previousComparablePeriodTotal}
                      previousMonthName={previousMonthName}
                      currentMonthName={currentMonthName}
                      budgetStatus={currentMonthlyBudget.status}
                      budgetAmount={currentMonthlyBudget.amount}
                      budgetCanWrite={currentMonthlyBudget.canWrite}
                      currentMonthExpenses={currentMonthExpenses}
                      last7DaysTrend={last7DaysTrend}
                      last7DaysExpenses={last7DaysExpenses}
                      onSaveBudget={currentMonthlyBudget.saveCurrentMonthlyBudget}
                      onOpenCurrentMonthExpenses={() => {
                        setFilterMonth(format(new Date(), 'yyyy-MM'));
                        setFilterCategory('all');
                        setCompanionFilter({ kind: 'all' });
                        setFilterSearch('');
                        expensesScrollYRef.current = 0;
                        setView('all');
                      }}
                    />
                    <RecentExpensesList
                      expenses={recentExpenses}
                      companionDisplayNamesById={companionDisplayNamesById}
                      onViewAll={navigateToExpenses}
                      onEdit={handleEditClick}
                      onDelete={handleConfirmedDeleteExpense}
                    />
                  </>
                ) : null
              ) : null}

              <div key={activeTenantId} hidden={view !== 'all'} inert={view !== 'all'}>
                <AllExpensesView
                  filteredTotal={filteredTotal}
                  filteredExpenses={filteredExpenses}
                  companionDisplayNamesById={companionDisplayNamesById}
                  companionFilterChoices={companionFilterChoices}
                  companionFilterVisible={companionFilterVisible}
                  filters={{ filterMonth, filterCategory, companionFilter, filterSearch }}
                  onFiltersChange={(next) => {
                    setFilterMonth(next.filterMonth);
                    setFilterCategory(next.filterCategory);
                    setCompanionFilter(next.companionFilter);
                    setFilterSearch(next.filterSearch);
                  }}
                  onBack={navigateToHome}
                  onEdit={handleEditClick}
                  onDelete={handleConfirmedDeleteExpense}
                />
              </div>
            </>
          ) : null}
        </main>
      </div>

      {!isAdding ? (
        <BottomNavigation
          activeView={view}
          onHome={navigateToHome}
          onExpenses={navigateToExpenses}
          onSettings={navigateToSettings}
          onAdd={() => setIsAdding(true)}
          addDisabled={!userId || !activeTenantId || isTenantContextLoading}
        />
      ) : null}

      <ExpenseForm
        isOpen={isAdding}
        editingId={editingId}
        newExpense={newExpense}
        companionSelector={companionSelector}
        onChange={setNewExpense}
        onClose={discardExpenseFormSession}
        onSubmit={handleAddExpense}
        isSubmitting={isExpenseSubmitting}
        submitError={expenseCompanionSubmitError}
      />
    </div>
  );
}
