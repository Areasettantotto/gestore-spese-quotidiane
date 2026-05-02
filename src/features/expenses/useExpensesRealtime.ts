import { useEffect } from "react";
import { supabase } from "@/src/lib/supabaseClient";

export type ExpenseRow = {
  id: string;
  amount: number;
  category: string;
  description: string;
  date: string;
  tenant_id?: string;
  user_id?: string;
  owner_id?: string;
  accompagnatore?: string | null;
  created_at?: string;
};

type RealtimeHandlers = {
  onInsert?: (row: ExpenseRow) => void;
  onUpdate?: (row: ExpenseRow) => void;
  onDelete?: (row: ExpenseRow) => void;
};

/**
 * Subscribes to public.expenses changes filtered by tenant_id only.
 * When scopeTenantId is missing, no channel is opened (avoid broad or owner-only streams).
 */
export function useExpensesRealtime(
  handlers: RealtimeHandlers,
  opts?: { scopeTenantId: string }
) {
  useEffect(() => {
    if (!opts?.scopeTenantId) {
      return;
    }

    const channel = supabase
      .channel("rt-expenses")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expenses",
          filter: `tenant_id=eq.${opts.scopeTenantId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            handlers.onInsert?.(payload.new as ExpenseRow);
          }
          if (payload.eventType === "UPDATE") {
            handlers.onUpdate?.(payload.new as ExpenseRow);
          }
          if (payload.eventType === "DELETE") {
            handlers.onDelete?.(payload.old as ExpenseRow);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [handlers, opts?.scopeTenantId]);
}
