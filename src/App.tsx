/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { it } from 'date-fns/locale';

import { type Expense, type Category, CATEGORIES, type Accompagnatore } from './types';
import { supabase } from './lib/supabaseClient';
import { useExpenses } from '@/src/features/expenses/useExpenses';
import { useActiveTenant } from '@/src/features/tenancy/useActiveTenant';
import { AppHeader } from '@/src/components/app/AppHeader';
import { WorkspaceLoadingState } from '@/src/components/app/WorkspaceLoadingState';
import { WorkspaceUnavailableState } from '@/src/components/app/WorkspaceUnavailableState';
import { ExpensesLoadErrorBanner } from '@/src/components/app/ExpensesLoadErrorBanner';
import { SummaryCards } from '@/src/components/app/SummaryCards';
import { RecentExpensesList } from '@/src/components/app/RecentExpensesList';
import { ExpenseForm } from '@/src/components/app/ExpenseForm';
import { AllExpensesView } from '@/src/components/app/AllExpensesView';

type ViewMode = 'home' | 'all';

export default function App() {
  const [view, setView] = useState<ViewMode>('home');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const { activeTenantId, isTenantContextLoading, tenantError, loadDefaultTenant, resolveTenantForMutation, resetTenantState } =
    useActiveTenant();

  const { expenses, expensesLoadError, saveExpense, deleteExpense } = useExpenses({
    userId,
    activeTenantId,
    isTenantContextLoading,
    resolveTenantForMutation,
  });

  const [filterMonth, setFilterMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [filterCategory, setFilterCategory] = useState<Category | 'Tutte'>('Tutte');
  const [filterAccompagnatore, setFilterAccompagnatore] = useState<Accompagnatore | 'Tutte' | 'Senza'>('Tutte');
  const [filterSearch, setFilterSearch] = useState('');

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const totalMonthly = useMemo(() => {
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());
    return expenses.filter((e) => isWithinInterval(parseISO(e.date), { start, end })).reduce((acc, curr) => acc + curr.amount, 0);
  }, [expenses]);

  const categoryData = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      name: cat,
      value: expenses.filter((e) => e.category === cat).reduce((acc, curr) => acc + curr.amount, 0),
    })).filter((d) => d.value > 0);
  }, [expenses]);

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

  const dailyData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return format(d, 'yyyy-MM-dd');
    }).reverse();

    return last7Days.map((date) => ({
      date: format(parseISO(date), 'dd/MM'),
      amount: expenses.filter((e) => e.date === date).reduce((acc, curr) => acc + curr.amount, 0),
    }));
  }, [expenses]);

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
  };

  const handleEditClick = (expense: Expense) => {
    setNewExpense(expense);
    setEditingId(expense.id);
    setIsAdding(true);
  };

  const handleDeleteExpense = (expense: Expense) => {
    if (confirm(`Confermi l'eliminazione di "${expense.description}"?`)) {
      void deleteExpense(expense.id);
    }
  };

  return (
    <div className="min-h-screen pb-20">
      <AppHeader
        dateLabel={format(new Date(), 'EEEE d MMMM', { locale: it })}
        userEmail={userEmail}
        addDisabled={!userId || !activeTenantId || isTenantContextLoading}
        onAdd={() => setIsAdding(true)}
        onSignOut={handleSignOut}
      />

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {userId && activeTenantId && expensesLoadError ? <ExpensesLoadErrorBanner message={expensesLoadError} /> : null}
        {userId && isTenantContextLoading ? <WorkspaceLoadingState /> : null}
        {userId && !isTenantContextLoading && !activeTenantId ? <WorkspaceUnavailableState tenantError={tenantError} /> : null}

        {userId && !isTenantContextLoading && activeTenantId && view === 'home' ? (
          <>
            <SummaryCards totalMonthly={totalMonthly} categoryData={categoryData} dailyData={dailyData} />
            <RecentExpensesList
              expenses={recentExpenses}
              onViewAll={() => setView('all')}
              onEdit={handleEditClick}
              onDelete={handleDeleteExpense}
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
            onDelete={handleDeleteExpense}
          />
        ) : null}
      </main>

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
      />
    </div>
  );
}
