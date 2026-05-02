import { useEffect } from "react";
import { supabase } from "@/src/lib/supabaseClient";

import type { ExpenseDbRow } from "./expenses.types";

type RealtimeHandlers = {
  onInsert?: (row: ExpenseDbRow) => void;
  onUpdate?: (row: ExpenseDbRow) => void;
  onDelete?: (row: ExpenseDbRow) => void;
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
      .channel(`rt-expenses-${opts.scopeTenantId}`)
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
            handlers.onInsert?.(payload.new as ExpenseDbRow);
          }
          if (payload.eventType === "UPDATE") {
            handlers.onUpdate?.(payload.new as ExpenseDbRow);
          }
          if (payload.eventType === "DELETE") {
            handlers.onDelete?.(payload.old as ExpenseDbRow);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [handlers, opts?.scopeTenantId]);
}
