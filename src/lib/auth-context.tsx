'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { jwtDecode } from 'jwt-decode';

interface User {
  email: string;
  name?: string;
  is_developer?: boolean;
  isDeveloper?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  isDeveloper: boolean;
  login: (token: string, tokenType: string, isAdmin?: boolean, isDeveloper?: boolean) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isDeveloper, setIsDeveloper] = useState<boolean>(false);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const storedIsAdmin = localStorage.getItem('is_admin');
    const storedIsDeveloper = localStorage.getItem('is_developer');
    const isAdmin =
      storedIsAdmin === 'true' ||
      storedIsAdmin === '1' ||
      storedIsAdmin === 'True';
    const isDeveloperFlag =
      storedIsDeveloper === 'true' ||
      storedIsDeveloper === '1' ||
      storedIsDeveloper === 'True';
    setIsDeveloper(isDeveloperFlag);

    if (token) {
      fetchUser(token, 'bearer', isAdmin, isDeveloperFlag);
    } else {
      setIsLoading(false);
    }
  }, []);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

  const fetchUser = async (token: string, tokenType: string, isAdmin: boolean, fallbackIsDeveloper = false) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          'Authorization': `${tokenType} ${token}`
        }
      });

      if (response.ok) {
        const userData = await response.json();
        const developerFlag = Boolean(userData?.is_developer ?? userData?.isDeveloper);
        setUser({
          ...userData,
          is_developer: developerFlag,
          isDeveloper: developerFlag,
        });
        setIsAdmin(isAdmin);
        setIsDeveloper(developerFlag);
        localStorage.setItem('is_developer', String(developerFlag));
        document.cookie = `is_developer=${String(developerFlag)}; path=/`;
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
  const IS_DEVELOPER_KEY = 'is_developer';

  const login = (newToken: string, tokenType: string, admin = false, developer = false) => {
    console.log('ログイン実行:', { token: !!newToken, isAdmin: admin });
    
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(TOKEN_TYPE_KEY, tokenType);
    localStorage.setItem(IS_ADMIN_KEY, String(admin));
    localStorage.setItem(IS_DEVELOPER_KEY, String(developer));
    setIsAdmin(admin);
    setIsDeveloper(developer);
    
    document.cookie = `${TOKEN_KEY}=${newToken}; path=/`;
    document.cookie = `${TOKEN_TYPE_KEY}=${tokenType}; path=/`;
    document.cookie = `is_admin=${String(admin)}; path=/`;
    document.cookie = `is_developer=${String(developer)}; path=/`;
    
    fetchUser(newToken, tokenType, admin, developer);
    
    return true; // 処理完了を明示的に返す
  };

  const logout = async () => {
    console.log('Logout function called');
    
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_TYPE_KEY);
      localStorage.removeItem(IS_ADMIN_KEY);
      localStorage.removeItem(IS_DEVELOPER_KEY);
      console.log('LocalStorage items removed');
      
      const domain = window.location.hostname;
      
      document.cookie = `${TOKEN_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      document.cookie = `${TOKEN_TYPE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      document.cookie = `is_admin=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      document.cookie = `is_developer=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      
      document.cookie = `${TOKEN_KEY}=; path=/; domain=${domain}; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      document.cookie = `${TOKEN_TYPE_KEY}=; path=/; domain=${domain}; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      document.cookie = `is_admin=; path=/; domain=${domain}; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      document.cookie = `is_developer=; path=/; domain=${domain}; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      
      if (domain !== 'localhost') {
        const rootDomain = domain.split('.').slice(-2).join('.');
        document.cookie = `${TOKEN_KEY}=; path=/; domain=.${rootDomain}; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
        document.cookie = `${TOKEN_TYPE_KEY}=; path=/; domain=.${rootDomain}; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
        document.cookie = `is_admin=; path=/; domain=.${rootDomain}; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
        document.cookie = `is_developer=; path=/; domain=.${rootDomain}; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      }
      
      if (window.location.protocol === 'https:') {
        document.cookie = `${TOKEN_KEY}=; path=/; secure; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
        document.cookie = `${TOKEN_TYPE_KEY}=; path=/; secure; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
        document.cookie = `is_admin=; path=/; secure; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
        document.cookie = `is_developer=; path=/; secure; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      }
      
      document.cookie = `token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      document.cookie = `token_type=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      localStorage.removeItem('token');
      
      console.log('Cookies removed, current cookies:', document.cookie);
      
      setUser(null);
      setIsAdmin(false);
      setIsDeveloper(false);
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
      isDeveloper,
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
