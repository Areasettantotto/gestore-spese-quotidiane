import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "./lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (!data.session) {
        setEmail("");
        setPassword("");
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        setEmail("");
        setPassword("");
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async () => {
    try {
      setSubmitting(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="card w-full max-w-md p-8">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-text-primary">Gestore Spese</h1>
            <p className="text-sm text-text-muted mt-2">Accedi per gestire le tue spese quotidiane</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              signIn();
            }}
            className="space-y-4"
            autoComplete="off"
          >
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">Email</label>
              <input
                type="email"
                name="email"
                autoComplete="off"
                placeholder="tuo@esempio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">Password</label>
              <input
                type="password"
                name="password"
                autoComplete="off"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <div className="flex items-center justify-between text-xs text-text-muted">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="accent-primary" />
                <span>Ricordami</span>
              </label>
              {/* <button type="button" className="text-primary hover:underline">Password dimenticata?</button> */}
            </div>

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? 'Accesso...' : 'Accedi'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-text-muted">
            <span>Non hai un account? Contatta l'amministratore</span>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
