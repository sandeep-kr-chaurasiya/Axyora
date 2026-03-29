import { useEffect, useState } from "react";
import type { User } from "firebase/auth";

import { signIn, signUp, watchAuthState, logout } from "../services/firebase";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = watchAuthState((next) => {
      setUser(next);
      setLoading(false);
    });
    return unsub;
  }, []);

  return {
    user,
    loading,
    signIn,
    signUp,
    logout,
  };
}
