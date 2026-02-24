import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "./lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setEmail("");
    setPassword("");
  };

  if (loading) return null;

  if (!session) {
    return (
      <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }} autoComplete="off">
        <h2>Accedi</h2>
        <input
          style={{ width: "100%", padding: 10, marginTop: 10 }}
          type="email"
          name="email"
          autoComplete="off"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          style={{ width: "100%", padding: 10, marginTop: 10 }}
          type="password"
          name="password"
          autoComplete="off"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button style={{ width: "100%", padding: 12, marginTop: 12 }} onClick={signIn}>
          Login
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
