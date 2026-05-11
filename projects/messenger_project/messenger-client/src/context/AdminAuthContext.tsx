import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AdminInfo {
  token: string;
  role: 'superadmin' | 'office_admin';
  officeId: string | null;
  officeName?: string;
}

interface AdminAuthContextType {
  admin: AdminInfo | null;
  login: (info: AdminInfo) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType>({
  admin: null,
  login: () => {},
  logout: () => {},
  isAuthenticated: false,
  isSuperAdmin: false,
});

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminInfo | null>(() => {
    const saved = localStorage.getItem('admin_auth');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (admin) {
      localStorage.setItem('admin_auth', JSON.stringify(admin));
    } else {
      localStorage.removeItem('admin_auth');
    }
  }, [admin]);

  const login = (info: AdminInfo) => setAdmin(info);
  const logout = async () => {
    if (admin?.token) {
      try {
        await fetch(`${API}/api/admin/logout`, {
          method: 'POST',
          headers: { 'x-admin-token': admin.token },
        });
      } catch { /* ignore */ }
    }
    setAdmin(null);
  };

  return (
    <AdminAuthContext.Provider value={{
      admin,
      login,
      logout,
      isAuthenticated: !!admin,
      isSuperAdmin: admin?.role === 'superadmin',
    }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export const useAdminAuth = () => useContext(AdminAuthContext);
