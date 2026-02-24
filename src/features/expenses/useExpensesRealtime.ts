import { useEffect } from "react";
import { supabase } from "@/src/lib/supabaseClient";

export type ExpenseRow = {
  id: string;
  amount: number;
  category: string;
  description: string;
  date: string;
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

export function useExpensesRealtime(
  handlers: RealtimeHandlers,
  opts?: { scopeUserId?: string }
) {
  useEffect(() => {

    const channel = supabase
      .channel("rt-expenses")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expenses",
          ...(opts?.scopeUserId
            ? { filter: `owner_id=eq.${opts.scopeUserId}` }
            : {}),
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
  }, [handlers, opts?.scopeUserId]);
}
