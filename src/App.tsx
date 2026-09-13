/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, startOfMonth, endOfMonth, lastDayOfMonth, setDate, subMonths } from 'date-fns';
import { it } from 'date-fns/locale';

import { type Expense, type Category, type Accompagnatore } from './types';
import { supabase } from './lib/supabaseClient';
import { buildLast7DaysTrend } from '@/src/features/expenses/last7DaysTrend';
import { useExpenses } from '@/src/features/expenses/useExpenses';
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
import { ExpenseForm } from '@/src/components/app/ExpenseForm';
import { AllExpensesView } from '@/src/components/app/AllExpensesView';

type ViewMode = 'home' | 'all';

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

function expensesBetween(expenses: Expense[], fromDate: string, toDate: string): Expense[] {
  return expenses.filter((expense) => expense.date >= fromDate && expense.date <= toDate);
}

function sumExpenses(expenses: Expense[]): number {
  return expenses.reduce((acc, curr) => acc + curr.amount, 0);
}

function sumExpensesBetween(expenses: Expense[], fromDate: string, toDate: string): number {
  return sumExpenses(expensesBetween(expenses, fromDate, toDate));
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

  const effectiveAccess = useEffectiveAccess({
    activeTenantId,
    isTenantContextLoading,
  });
  const { badgeLabel: accessBadgeLabel, accountTier, giftLabel } = accessPresentationFromEffectiveAccess(effectiveAccess);

  const { expenses, expensesLoadError, saveExpense, deleteExpense } = useExpenses({
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
  const [filterCategory, setFilterCategory] = useState<Category | 'Tutte'>('Tutte');
  const [filterAccompagnatore, setFilterAccompagnatore] = useState<Accompagnatore | 'Tutte' | 'Senza'>('Tutte');
  const [filterSearch, setFilterSearch] = useState('');

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isExpenseSubmitting, setIsExpenseSubmitting] = useState(false);
  const expenseSubmitLockRef = useRef(false);
  const [newExpense, setNewExpense] = useState<Partial<Expense>>({
    amount: undefined,
    category: 'Alimentazione',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    accompagnatore: undefined,
  });

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

  const recentExpenses = useMemo(() => {
    return [...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((e) => {
        const matchesMonth = e.date.startsWith(filterMonth);
        const matchesCategory = filterCategory === 'Tutte' || e.category === filterCategory;
        const matchesSearch = e.description.toLowerCase().includes(filterSearch.toLowerCase());
        const matchesAccompagnatore =
          filterAccompagnatore === 'Tutte' ||
          (filterAccompagnatore === 'Senza' ? e.accompagnatore === undefined : e.accompagnatore === filterAccompagnatore);
        return matchesMonth && matchesCategory && matchesSearch && matchesAccompagnatore;
      })
      .sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateB !== dateA) return dateB - dateA;
        return a.description.localeCompare(b.description);
      });
  }, [expenses, filterMonth, filterCategory, filterSearch, filterAccompagnatore]);

  const filteredTotal = useMemo(() => {
    return filteredExpenses.reduce((acc, curr) => acc + curr.amount, 0);
  }, [filteredExpenses]);

  const last7DaysTrend = useMemo(() => buildLast7DaysTrend(expenses), [expenses]);
  const last7DaysExpenses = useMemo(() => {
    const dateKeys = new Set(last7DaysTrend.map((point) => point.dateKey));
    return expenses.filter((expense) => dateKeys.has(expense.date));
  }, [expenses, last7DaysTrend]);

  const resetExpenseDraft = () => {
    setEditingId(null);
    setNewExpense({
      amount: undefined,
      category: 'Alimentazione',
      description: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      accompagnatore: undefined,
    });
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();

    const rawAmount = newExpense.amount;
    const amountNum = typeof rawAmount === 'number' ? rawAmount : Number(String(rawAmount ?? '').replace(',', '.'));

    if (!newExpense.description || !newExpense.date || !newExpense.category) return;
    if (isNaN(amountNum) || amountNum <= 0) return;

    if (expenseSubmitLockRef.current) return;
    expenseSubmitLockRef.current = true;
    setIsExpenseSubmitting(true);

    try {
      await saveExpense({
        amount: amountNum,
        category: newExpense.category as Category,
        description: newExpense.description,
        date: newExpense.date,
        accompagnatore: newExpense.accompagnatore,
        editingId,
      });

      setIsAdding(false);
      resetExpenseDraft();
    } finally {
      expenseSubmitLockRef.current = false;
      setIsExpenseSubmitting(false);
    }
  };

  const handleEditClick = (expense: Expense) => {
    setNewExpense(expense);
    setEditingId(expense.id);
    setIsAdding(true);
  };

  const handleConfirmedDeleteExpense = (expense: Expense) => {
    void deleteExpense(expense.id);
  };

  return (
    <div className="min-h-screen pb-28 lg:pb-0">
      <DesktopSidebar
        activeView={view}
        onHome={() => setView('home')}
        onExpenses={() => setView('all')}
      />

      <div className="lg:pl-64">
        <AppHeader
          dateLabel={format(new Date(), 'EEEE d MMMM', { locale: it })}
          userEmail={userEmail}
          addDisabled={!userId || !activeTenantId || isTenantContextLoading}
          accessBadgeLabel={accessBadgeLabel}
          accountTier={accountTier}
          giftLabel={giftLabel}
          onAdd={() => setIsAdding(true)}
          onSignOut={handleSignOut}
        />

        <main className="max-w-2xl mx-auto px-4 pt-4 pb-8 md:pt-8 space-y-8">
          {userId && activeTenantId && expensesLoadError ? <ExpensesLoadErrorBanner message={expensesLoadError} /> : null}
          {userId && isTenantContextLoading ? <WorkspaceLoadingState /> : null}
          {userId && !isTenantContextLoading && !activeTenantId ? <WorkspaceUnavailableState tenantError={tenantError} /> : null}

          {userId && !isTenantContextLoading && activeTenantId && view === 'home' ? (
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
                  setFilterCategory('Tutte');
                  setFilterAccompagnatore('Tutte');
                  setFilterSearch('');
                  setView('all');
                }}
              />
              <RecentExpensesList
                expenses={recentExpenses}
                onViewAll={() => setView('all')}
                onEdit={handleEditClick}
                onDelete={handleConfirmedDeleteExpense}
              />
            </>
          ) : null}

          {userId && !isTenantContextLoading && activeTenantId && view === 'all' ? (
            <AllExpensesView
              filteredTotal={filteredTotal}
              filteredExpenses={filteredExpenses}
              filters={{ filterMonth, filterCategory, filterAccompagnatore, filterSearch }}
              onFiltersChange={(next) => {
                setFilterMonth(next.filterMonth);
                setFilterCategory(next.filterCategory);
                setFilterAccompagnatore(next.filterAccompagnatore);
                setFilterSearch(next.filterSearch);
              }}
              onBack={() => setView('home')}
              onEdit={handleEditClick}
              onDelete={handleConfirmedDeleteExpense}
            />
          ) : null}
        </main>
      </div>

      {!isAdding ? (
        <BottomNavigation
          activeView={view}
          onHome={() => setView('home')}
          onExpenses={() => setView('all')}
          onAdd={() => setIsAdding(true)}
          addDisabled={!userId || !activeTenantId || isTenantContextLoading}
        />
      ) : null}

      <ExpenseForm
        isOpen={isAdding}
        editingId={editingId}
        newExpense={newExpense}
        onChange={setNewExpense}
        onClose={() => {
          setIsAdding(false);
          resetExpenseDraft();
        }}
        onSubmit={handleAddExpense}
        isSubmitting={isExpenseSubmitting}
      />
    </div>
  );
}
