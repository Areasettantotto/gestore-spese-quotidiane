/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Pencil,
  TrendingUp,
  Wallet,
  Calendar,
  Tag,
  User,
  ChevronRight,
  PieChart as PieChartIcon,
  ArrowUpRight,
  ArrowDownRight,
  X,
  ArrowLeft,
  Search,
  Filter,
  Coffee,
  Truck,
  Home,
  Music,
  Heart,
  ShoppingBag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { it } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { Expense, Category, CATEGORIES, Accompagnatore, ACCOMPAGNATORI } from './types';
import { CATEGORY_ICONS } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Safe id generator (fallback for iOS Safari if crypto.randomUUID is unavailable)
const makeId = () => {
  if (globalThis.crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const COLORS = [
  '#10b981', // emerald-500
  '#3b82f6', // blue-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#64748b', // slate-500
];

export default function App() {
  const [view, setView] = useState<'home' | 'all'>('home');
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    const saved = localStorage.getItem('expenses');
    return saved ? JSON.parse(saved) : [];
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
    try {
      localStorage.setItem('expenses', JSON.stringify(expenses));
    } catch (err) {
      console.error('localStorage save failed', err);
      alert('Impossibile salvare su questo browser.');
    }
  }, [expenses]);

  // Seed demo record once per device if no expenses present
  useEffect(() => {
    const seededKey = 'expenses_seeded_v1';
    const alreadySeeded = localStorage.getItem(seededKey) === '1';
    try {
      const savedRaw = localStorage.getItem('expenses');
      const saved = savedRaw ? JSON.parse(savedRaw) : [];
      if (!alreadySeeded && (!saved || saved.length === 0)) {
        const demo: Expense = {
          id: makeId(),
          amount: 12.5,
          category: 'Alimentazione',
          description: 'Spesa demo (mobile)',
          date: format(new Date(), 'yyyy-MM-dd'),
          accompagnatore: undefined,
        };
        setExpenses([demo]);
        localStorage.setItem(seededKey, '1');
      }
    } catch (err) {
      console.error('Seeding check failed', err);
    }
  }, []);

  const totalMonthly = useMemo(() => {
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());
    return expenses
      .filter(e => isWithinInterval(parseISO(e.date), { start, end }))
      .reduce((acc, curr) => acc + curr.amount, 0);
  }, [expenses]);

  const categoryData = useMemo(() => {
    const data = CATEGORIES.map(cat => ({
      name: cat,
      value: expenses
        .filter(e => e.category === cat)
        .reduce((acc, curr) => acc + curr.amount, 0)
    })).filter(d => d.value > 0);
    return data;
  }, [expenses]);

  const recentExpenses = useMemo(() => {
    return [...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
  }, [expenses]);

  const allExpensesSorted = useMemo(() => {
    return [...expenses].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateB !== dateA) return dateB - dateA;
      return a.description.localeCompare(b.description);
    });
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const matchesMonth = e.date.startsWith(filterMonth);
      const matchesCategory = filterCategory === 'Tutte' || e.category === filterCategory;
      const matchesSearch = e.description.toLowerCase().includes(filterSearch.toLowerCase());
      const matchesAccompagnatore = filterAccompagnatore === 'Tutte' || (
        filterAccompagnatore === 'Senza' ? (e.accompagnatore === undefined) : e.accompagnatore === filterAccompagnatore
      );
      return matchesMonth && matchesCategory && matchesSearch && matchesAccompagnatore;
    }).sort((a, b) => {
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

    return last7Days.map(date => ({
      date: format(parseISO(date), 'dd/MM'),
      amount: expenses
        .filter(e => e.date === date)
        .reduce((acc, curr) => acc + curr.amount, 0)
    }));
  }, [expenses]);

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();

    // Parse amount robustly (allow comma as decimal separator on mobile)
    const rawAmount = (newExpense.amount as any);
    const amountNum = typeof rawAmount === 'number'
      ? rawAmount
      : Number(String(rawAmount ?? '').replace(',', '.'));


    if (!newExpense.description || !newExpense.date || !newExpense.category) return;
    if (isNaN(amountNum) || amountNum <= 0) return;

    if (editingId) {
      setExpenses(expenses.map(exp =>
        exp.id === editingId
          ? { ...exp, ...newExpense as Expense, amount: amountNum }
          : exp
      ));
    } else {

      const expense: Expense = {
        id: makeId(),
        amount: amountNum,
        category: newExpense.category as Category,
        description: newExpense.description,
        date: newExpense.date,
        accompagnatore: newExpense.accompagnatore || undefined,
      };
      setExpenses([expense, ...expenses]);
    }

    setIsAdding(false);
    setEditingId(null);
    setNewExpense({
      amount: undefined,
      category: 'Alimentazione',
      description: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      accompagnatore: undefined,
    });
  };

  const handleEditClick = (expense: Expense) => {
    setNewExpense(expense);
    setEditingId(expense.id);
    setIsAdding(true);
  };

  const deleteExpense = (id: string) => {
    setExpenses(expenses.filter(e => e.id !== id));
  };

  // Map simple icon keys from types to actual lucide-react components
  const ICON_COMPONENTS: Record<string, React.ComponentType<any>> = {
    Coffee,
    Truck,
    Home,
    Music,
    Heart,
    ShoppingBag,
    Tag,
  };

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Gestore Spese</h1>
            <p className="text-sm text-zinc-500">{format(new Date(), 'EEEE d MMMM', { locale: it })}</p>
          </div>
          <button
            onClick={() => setIsAdding(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            <span>Aggiungi</span>
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {view === 'home' ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card p-6 flex flex-col justify-between"
              >
                <div className="flex justify-between items-start">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                    <Wallet size={24} />
                  </div>
                  <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full flex items-center gap-1">
                    <ArrowUpRight size={12} />
                    Questo mese
                  </span>
                </div>
                <div className="mt-4">
                  <p className="text-sm text-zinc-500 font-medium">Totale Spese</p>
                  <p className="text-3xl font-bold text-zinc-900">€{totalMonthly.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="card p-6 flex flex-col justify-between"
              >
                <div className="flex justify-between items-start">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    <TrendingUp size={24} />
                  </div>
                  <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                    Distribuzione
                  </span>
                </div>
                <div className="mt-4 h-24">
                  {categoryData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={30}
                          outerRadius={45}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {categoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => `€${value.toFixed(2)}`}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-zinc-400 text-xs italic">
                      Nessun dato disponibile
                    </div>
                  )}
                </div>
              </motion.div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 gap-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="card p-6"
              >
                <h3 className="text-sm font-semibold text-zinc-900 mb-4">Andamento ultimi 7 giorni</h3>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: '#71717a' }}
                      />
                      <YAxis
                        hide
                      />
                      <Tooltip
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        formatter={(value: number) => [`€${value.toFixed(2)}`, 'Spesa']}
                      />
                      <Bar
                        dataKey="amount"
                        fill="#10b981"
                        radius={[4, 4, 0, 0]}
                        barSize={32}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>
            </div>

            {/* Recent Activity */}
            <section className="space-y-4">
              <div className="flex justify-between items-end">
                <h2 className="text-lg font-semibold text-zinc-900">Attività Recente</h2>
                <button
                  onClick={() => setView('all')}
                  className="text-sm text-emerald-600 font-medium hover:underline"
                >
                  Vedi tutto
                </button>
              </div>

              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {recentExpenses.length > 0 ? (
                    recentExpenses.map((expense) => (
                      <motion.div
                        key={expense.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="card p-4 flex items-center justify-between group hover:border-emerald-200 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center",
                            "bg-zinc-50 text-zinc-500 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors"
                          )}>
                            {(() => {
                              const key = CATEGORY_ICONS[expense.category];
                              const Icon = ICON_COMPONENTS[key] ?? Tag;
                              return <Icon size={20} />;
                            })()}
                          </div>
                          <div>
                            <p className="font-semibold text-zinc-900">{expense.description}</p>
                            <div className="flex items-center gap-2 text-xs text-zinc-500">
                              <span className="font-medium px-1.5 py-0.5 bg-zinc-100 rounded text-zinc-600">{expense.accompagnatore ? expense.accompagnatore.charAt(0) : 'S'}</span>
                              <span>•</span>
                              <span>{format(parseISO(expense.date), 'd MMM', { locale: it })}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-zinc-900">€{expense.amount.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
                          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleEditClick(expense)}
                              className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            >
                              <Pencil size={18} />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Confermi l'eliminazione di "${expense.description}"?`)) {
                                  deleteExpense(expense.id);
                                }
                              }}
                              className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="card p-12 flex flex-col items-center justify-center text-center space-y-4 border-dashed">
                      <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-300">
                        <Wallet size={32} />
                      </div>
                      <div>
                        <p className="text-zinc-900 font-medium">Nessuna spesa registrata</p>
                        <p className="text-zinc-500 text-sm">Inizia aggiungendo la tua prima spesa quotidiana.</p>
                      </div>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </section>
          </>
        ) : (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setView('home')}
                  className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-600"
                >
                  <ArrowLeft size={24} />
                </button>
                <h2 className="text-xl font-bold text-zinc-900">Tutte le Spese</h2>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Totale filtrato</p>
                <p className="text-lg font-bold text-emerald-600">€{filteredTotal.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>

            {/* Filters UI */}
            <div className="card p-4 overflow-hidden min-w-0">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:grid-rows-2 md:items-center min-w-0">
                <div className="relative w-full min-w-0 overflow-hidden flex items-center">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 shrink-0" size={18} />
                  <input
                    type="text"
                    placeholder="Cerca descrizione..."
                    className="input-field pl-10! flex-1 w-full min-w-0 max-w-full box-border"
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                  />
                </div>
                <div className="relative w-full min-w-0 md:min-w-30 overflow-hidden flex items-center">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 shrink-0" size={18} />
                  <input
                    type="month"
                    className="input-field pl-10! flex-1 w-full min-w-0 max-w-full box-border"
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                  />
                </div>
                <div className="relative w-full min-w-0 md:min-w-30 overflow-hidden flex items-center">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 shrink-0 pointer-events-none" size={18} />
                  <select
                    className="input-field pl-10! flex-1 w-full min-w-0 max-w-full appearance-none leading-normal box-border"
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value as any)}
                  >
                    <option value="Tutte">Tutte</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="relative w-full min-w-0 md:min-w-30 overflow-hidden flex items-center">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 shrink-0 pointer-events-none" size={18} />
                  <select
                    className="input-field pl-10! flex-1 w-full min-w-0 max-w-full appearance-none leading-normal box-border"
                    value={filterAccompagnatore}
                    onChange={(e) => setFilterAccompagnatore(e.target.value as Accompagnatore | 'Tutte' | 'Senza')}
                  >
                    <option value="Tutte">Tutte</option>
                    <option value="Senza">Senza Accompagnatore</option>
                    {ACCOMPAGNATORI.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {filteredExpenses.length > 0 ? (
                  filteredExpenses.map((expense) => (
                    <motion.div
                      key={expense.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="card p-4 flex items-center justify-between group hover:border-emerald-200 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center",
                          "bg-zinc-50 text-zinc-500 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors"
                        )}>
                          {(() => {
                            const key = CATEGORY_ICONS[expense.category];
                            const Icon = ICON_COMPONENTS[key] ?? Tag;
                            return <Icon size={20} />;
                          })()}
                        </div>
                        <div>
                          <p className="font-semibold text-zinc-900">{expense.description}</p>
                          <div className="flex items-center gap-2 text-xs text-zinc-500">
                            <span className="font-medium px-1.5 py-0.5 bg-zinc-100 rounded text-zinc-600">{expense.accompagnatore ? expense.accompagnatore.charAt(0) : 'S'}</span>
                            <span>•</span>
                            <span>{format(parseISO(expense.date), 'd MMMM yyyy', { locale: it })}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-zinc-900">€{expense.amount.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
                        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEditClick(expense)}
                            className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          >
                            <Pencil size={18} />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Confermi l'eliminazione di "${expense.description}"?`)) {
                                deleteExpense(expense.id);
                              }
                            }}
                            className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="card p-12 flex flex-col items-center justify-center text-center space-y-4 border-dashed">
                    <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-300">
                      <Search size={32} />
                    </div>
                    <div>
                      <p className="text-zinc-900 font-medium">Nessun risultato trovato</p>
                      <p className="text-zinc-500 text-sm">Prova a modificare i filtri di ricerca.</p>
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </section>
        )}
      </main>

      {/* Add Expense Modal */}
      <AnimatePresence>
        {isAdding && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsAdding(false);
                setEditingId(null);
                setNewExpense({
                  amount: undefined,
                  category: 'Alimentazione',
                  description: '',
                  date: format(new Date(), 'yyyy-MM-dd'),
                  accompagnatore: undefined,
                });
              }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-4xl p-8 z-50 shadow-2xl max-w-2xl mx-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-zinc-900">
                  {editingId ? 'Modifica Spesa' : 'Nuova Spesa'}
                </h2>
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setEditingId(null);
                    setNewExpense({
                      amount: undefined,
                      category: 'Alimentazione',
                      description: '',
                      date: format(new Date(), 'yyyy-MM-dd'),
                      accompagnatore: undefined,
                    });
                  }}
                  className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleAddExpense} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-zinc-700">Importo (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    autoFocus
                    placeholder="0.00"
                    className="input-field text-2xl font-bold py-4"
                    value={newExpense.amount ?? ''}
                    onChange={e => {
                      const v = e.target.value;
                      // allow comma as decimal separator on mobile keyboards
                      const parsed = v === '' ? undefined : Number(v.replace(',', '.'));
                      setNewExpense({...newExpense, amount: parsed});
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-zinc-700">Descrizione</label>
                  <input
                    type="text"
                    required
                    placeholder="Es. Spesa Esselunga"
                    className="input-field"
                    value={newExpense.description}
                    onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-zinc-700">Categoria</label>
                    <div className="relative w-full min-w-0 overflow-hidden flex items-center">
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 shrink-0 pointer-events-none" size={18} />
                      <select
                        className="input-field pl-10! flex-1 w-full min-w-0 max-w-full appearance-none leading-normal box-border"
                        value={newExpense.category}
                        onChange={e => setNewExpense({...newExpense, category: e.target.value as Category})}
                      >
                        {CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-zinc-700">Data</label>
                    <div className="relative w-full min-w-0 overflow-hidden flex items-center">
                      <input
                        type="date"
                        required
                        className="input-field flex-1 w-full min-w-0 max-w-full box-border"
                        value={newExpense.date}
                        onChange={e => setNewExpense({...newExpense, date: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-zinc-700">Accompagnatore</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 shrink-0 pointer-events-none" size={18} />
                    <select
                      className="input-field pl-10! w-full appearance-none leading-normal"
                      value={newExpense.accompagnatore ?? ''}
                      onChange={e => setNewExpense({...newExpense, accompagnatore: e.target.value ? (e.target.value as Accompagnatore) : undefined})}
                    >
                      <option value="">Senza Accompagnatore</option>
                      {ACCOMPAGNATORI.map(a => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button type="submit" className="btn-primary w-full py-4 text-lg mt-4">
                  {editingId ? 'Aggiorna Spesa' : 'Salva Spesa'}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
