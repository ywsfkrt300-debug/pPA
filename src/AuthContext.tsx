import React, { createContext, useContext, useEffect, useState } from 'react';

interface MockUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

interface AuthContextType {
  user: MockUser | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MockUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Generate or retrieve a persistent mock user ID
    let mockUid = localStorage.getItem('mock_uid');
    if (!mockUid) {
      mockUid = 'user_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('mock_uid', mockUid);
    }
    
    setUser({
      uid: mockUid,
      displayName: 'Guest User',
      email: 'guest@example.com',
      photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + mockUid,
    });
    setLoading(false);
  }, []);

  const login = async () => {
    // No-op since we are always logged in
  };

  const logout = async () => {
    // No-op
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
