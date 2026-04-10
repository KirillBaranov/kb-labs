import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type UserRole = 'viewer' | 'operator' | 'admin';

interface AuthState {
  role: UserRole;
  setRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<UserRole>(
    () => (localStorage.getItem('studio-user-role') as UserRole) || 'operator'
  );

  useEffect(() => {
    localStorage.setItem('studio-user-role', role);
  }, [role]);

  const setRole = (newRole: UserRole) => {
    setRoleState(newRole);
  };

  return <AuthContext.Provider value={{ role, setRole }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export function useRole() {
  const { role } = useAuth();
  return role;
}

