'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { jwtDecode } from 'jwt-decode';

interface User {
  email: string;
  name?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  login: (token: string, tokenType: string, isAdmin?: boolean) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const isAdmin = localStorage.getItem('is_admin') === 'true';

    if (token) {
      fetchUser(token, 'bearer', isAdmin);
    } else {
      setIsLoading(false);
    }
  }, []);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

  const fetchUser = async (token: string, tokenType: string, isAdmin: boolean) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          'Authorization': `${tokenType} ${token}`
        }
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        setIsAdmin(isAdmin);
      } else {
        logout();
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
      logout();
    } finally {
      setIsLoading(false);
    }
  };

  const TOKEN_KEY = 'auth_token';
  const TOKEN_TYPE_KEY = 'auth_token_type';
  const IS_ADMIN_KEY = 'is_admin';

  const login = (newToken: string, tokenType: string, admin = false) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(TOKEN_TYPE_KEY, tokenType);
    localStorage.setItem(IS_ADMIN_KEY, String(admin));
    setIsAdmin(admin);
    
    document.cookie = `${TOKEN_KEY}=${newToken}; path=/`;
    document.cookie = `${TOKEN_TYPE_KEY}=${tokenType}; path=/`;
    
    fetchUser(newToken, tokenType, admin);
  };

  const logout = async () => {
    console.log('Logout function called');
    
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_TYPE_KEY);
      localStorage.removeItem(IS_ADMIN_KEY);
      console.log('LocalStorage items removed');
      
      const domain = window.location.hostname;
      
      document.cookie = `${TOKEN_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      document.cookie = `${TOKEN_TYPE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      
      document.cookie = `${TOKEN_KEY}=; path=/; domain=${domain}; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      document.cookie = `${TOKEN_TYPE_KEY}=; path=/; domain=${domain}; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      
      if (domain !== 'localhost') {
        const rootDomain = domain.split('.').slice(-2).join('.');
        document.cookie = `${TOKEN_KEY}=; path=/; domain=.${rootDomain}; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
        document.cookie = `${TOKEN_TYPE_KEY}=; path=/; domain=.${rootDomain}; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      }
      
      if (window.location.protocol === 'https:') {
        document.cookie = `${TOKEN_KEY}=; path=/; secure; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
        document.cookie = `${TOKEN_TYPE_KEY}=; path=/; secure; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      }
      
      document.cookie = `token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      document.cookie = `token_type=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      localStorage.removeItem('token');
      
      console.log('Cookies removed, current cookies:', document.cookie);
      
      setUser(null);
      setIsAdmin(false);
      console.log('Auth state reset');
      
      setTimeout(() => {
        console.log('Redirecting to login page');
        window.location.href = '/login';
      }, 100);
      
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isLoading, 
      isAdmin, 
      login, 
      logout 
    }}>
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