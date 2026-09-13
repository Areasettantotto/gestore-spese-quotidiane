import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/src/lib/supabaseClient';
import type { Expense } from '@/src/types';

import { expenseFromUpdatePayload, mapDbRowToExpense } from './expenses.mapper';
import {
  createExpenseInTenant,
  deleteExpenseInTenant,
  loadExpensesForTenant,
  updateExpenseInTenant,
} from './expenses.service';
import type { ExpenseDbRow, SaveExpenseFormInput } from './expenses.types';
import { useExpensesRealtime } from './useExpensesRealtime';

export type { SaveExpenseFormInput } from './expenses.types';

const makeId = (): string => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }

  if (typeof cryptoApi?.getRandomValues !== 'function') {
    throw new Error('Secure random UUID generation is unavailable');
  }

  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export function useExpenses(options: {
  userId: string | null;
  activeTenantId: string | null;
  /** When true, skip expense fetch/clear errors until tenancy bootstrap finishes. */
  isTenantContextLoading: boolean;
  resolveTenantForMutation: (uid: string) => Promise<string | null>;
}) {
  const { userId, activeTenantId, isTenantContextLoading, resolveTenantForMutation } = options;

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesLoadError, setExpensesLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setExpenses([]);
      setExpensesLoadError(null);
    }
  }, [userId]);

  const loadExpenses = useCallback(async (tenantId: string | null) => {
    setExpensesLoadError(null);
    if (!tenantId) {
      setExpenses([]);
      return;
    }
    const { expenses: list, errorMessage } = await loadExpensesForTenant(tenantId);
    if (errorMessage) {
      setExpensesLoadError(errorMessage);
      return;
    }
    setExpenses(list);
  }, []);

  useEffect(() => {
    if (!userId) return;
    if (isTenantContextLoading) {
      setExpenses([]);
      setExpensesLoadError(null);
      return;
    }
    void loadExpenses(activeTenantId);
  }, [userId, activeTenantId, isTenantContextLoading, loadExpenses]);

  const realtimeHandlers = useMemo(
    () => ({
      onInsert: (row: ExpenseDbRow) => {
        const mapped = mapDbRowToExpense(row);
        setExpenses((prev) => {
          if (prev.some((e) => e.id === mapped.id)) return prev;
          const next = [mapped, ...prev];
          next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          return next;
        });
      },
      onUpdate: (row: ExpenseDbRow) => {
        const mapped = mapDbRowToExpense(row);
        setExpenses((prev) => {
          const next = prev.map((e) => (e.id === mapped.id ? mapped : e));
          next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          return next;
        });
      },
      onDelete: (row: ExpenseDbRow) => {
        setExpenses((prev) => prev.filter((e) => e.id !== row.id));
      },
    }),
    []
  );

  useExpensesRealtime(
    realtimeHandlers,
    userId && activeTenantId ? { scopeTenantId: activeTenantId } : undefined
  );

  const saveExpense = useCallback(
    async (input: SaveExpenseFormInput) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) {
        alert('Utente non autenticato');
        return;
      }

      const tenantIdForSave = await resolveTenantForMutation(user.id);
      if (!tenantIdForSave) {
        alert('Tenant non caricato, effettua di nuovo il login');
        return;
      }

      if (input.editingId) {
        const payloadCore = {
          amount: input.amount,
          category: input.category,
          description: input.description,
          date: input.date,
          accompagnatore: input.accompagnatore || null,
        };
        const { error } = await updateExpenseInTenant({
          expenseId: input.editingId,
          userId: user.id,
          tenantId: tenantIdForSave,
          amount: payloadCore.amount,
          category: payloadCore.category,
          description: payloadCore.description,
          date: payloadCore.date,
          accompagnatore: payloadCore.accompagnatore,
        });
        if (error) {
          alert('Impossibile aggiornare la spesa: ' + (error.message || JSON.stringify(error)));
        } else {
          const local = expenseFromUpdatePayload(input.editingId, payloadCore);
          setExpenses((prev) => prev.map((exp) => (exp.id === input.editingId ? local : exp)));
        }
      } else {
        const expense: Expense = {
          id: makeId(),
          amount: input.amount,
          category: input.category,
          description: input.description,
          date: input.date,
          accompagnatore: input.accompagnatore || undefined,
        };

        const { error } = await createExpenseInTenant({
          expense,
          userId: user.id,
          tenantId: tenantIdForSave,
        });
        if (error) {
          alert('Impossibile salvare la spesa: ' + (error.message || JSON.stringify(error)));
        } else {
          setExpenses((prev) => [expense, ...prev]);
        }
      }
    },
    [resolveTenantForMutation]
  );

  const deleteExpense = useCallback(
    async (id: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) {
        alert('Utente non autenticato');
        return;
      }

      const tenantIdForDelete = await resolveTenantForMutation(user.id);
      if (!tenantIdForDelete) {
        alert('Tenant non caricato, effettua di nuovo il login');
        return;
      }

      setExpenses((prev) => prev.filter((e) => e.id !== id));

      const { error, deletedRows } = await deleteExpenseInTenant({
        tenantId: tenantIdForDelete,
        expenseId: id,
      });

      if (error) {
        alert('Impossibile eliminare la spesa: ' + (error.message || JSON.stringify(error)));
        await loadExpenses(tenantIdForDelete);
        return;
      }

      if (!deletedRows || deletedRows.length === 0) {
        console.warn('DELETE: nessuna riga cancellata (id non match?)', id);
        await loadExpenses(tenantIdForDelete);
      }
    },
    [loadExpenses, resolveTenantForMutation]
  );

  return {
    expenses,
    expensesLoadError,
    loadExpenses,
    saveExpense,
    deleteExpense,
  };
}
