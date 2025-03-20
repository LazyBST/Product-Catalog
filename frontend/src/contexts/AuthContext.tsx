import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '@/services/api';

interface User {
  user_type: string;
  name: string;
  companyId?: number;
  id?: number;
}

interface AuthContextType {
  isLoggedIn: boolean;
  userName: string | null;
  companyName: string | null;
  userType: string | null;
  user: User | null;
  loading: boolean;
  setAuthState: (loggedIn: boolean, name: string | null, company: string | null, userType: string | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isLoggedIn: false,
  userName: null,
  companyName: null,
  userType: null,
  user: null,
  loading: true,
  setAuthState: () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [userType, setUserType] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in on mount
    const token = localStorage.getItem('token');
    const storedUserName = localStorage.getItem('userName');
    const storedCompanyName = localStorage.getItem('companyName');
    const storedUserType = localStorage.getItem('userType');
    
    if (token && storedUserName) {
      setIsLoggedIn(true);
      setUserName(storedUserName);
      setCompanyName(storedCompanyName);
      setUserType(storedUserType);
      
      // Create a user object from stored values
      if (storedUserName && storedUserType) {
        setUser({
          name: storedUserName,
          user_type: storedUserType,
        });
      }
    }
    
    // Set loading to false after auth check is complete
    setLoading(false);
  }, []);

  const logout = () => {
    api.logout();
    setIsLoggedIn(false);
    setUserName(null);
    setCompanyName(null);
    setUserType(null);
    setUser(null);
  };

  const setAuthState = (loggedIn: boolean, name: string | null, company: string | null, type: string | null) => {
    setLoading(true);

    setIsLoggedIn(loggedIn);
    setUserName(name);
    setCompanyName(company);
    setUserType(type);
    
    if (loggedIn && name && type) {
      // Create user object from auth data
      setUser({
        name,
        user_type: type
      });
      
      if (name) {
        localStorage.setItem('userName', name);
      }
      if (company) {
        localStorage.setItem('companyName', company);
      }
      if (type) {
        localStorage.setItem('userType', type);
      }
    } else {
      setUser(null);
      localStorage.removeItem('userName');
      localStorage.removeItem('companyName');
      localStorage.removeItem('userType');
      localStorage.removeItem('token');
    }
    
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, userName, companyName, userType, user, loading, setAuthState, logout }}>
      {children}
    </AuthContext.Provider>
  );
}; 