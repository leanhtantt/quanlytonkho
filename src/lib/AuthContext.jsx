import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { auth } from './firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      setProfileLoading(true);
      try {
        const nextProfile = await api.getMe();
        if (!cancelled) setProfile(nextProfile);
      } catch (error) {
        if (!cancelled) setProfileError(error);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setProfile(null);
      setProfileError(null);
      setAuthLoading(false);

      if (!u) {
        setProfileLoading(false);
        return;
      }

      loadProfile();
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const login = useCallback(
    (email, password) => signInWithEmailAndPassword(auth, email, password),
    []
  );

  const logout = useCallback(() => signOut(auth), []);

  // Helper: get current user's ID token for API calls
  const getToken = useCallback(
    () => (user ? user.getIdToken() : Promise.resolve(null)),
    [user]
  );

  const isAdmin = profile?.isAdmin === true;
  const permissions = useMemo(() => profile?.permissions || {}, [profile]);
  const can = useCallback(
    (resource, action) => isAdmin || Boolean(permissions[resource]?.includes(action)),
    [isAdmin, permissions]
  );
  const loading = authLoading || profileLoading;
  const isUnauthorized = user !== null && profileError?.status === 403;

  const value = useMemo(() => ({
    user,
    profile,
    isAdmin,
    permissions,
    can,
    loading,
    isUnauthorized,
    profileError,
    login,
    logout,
    getToken,
  }), [user, profile, isAdmin, permissions, can, loading, isUnauthorized, profileError, login, logout, getToken]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
