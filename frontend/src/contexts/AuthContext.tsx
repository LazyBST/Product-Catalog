import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  isLoggedIn: boolean;
  userName: string | null;
  companyName: string | null;
  setAuthState: (loggedIn: boolean, name: string | null, company: string | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  isLoggedIn: false,
  userName: null,
  companyName: null,
  setAuthState: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is logged in on mount
    const token = localStorage.getItem('token');
    const storedUserName = localStorage.getItem('userName');
    const storedCompanyName = localStorage.getItem('companyName');
    if (token && storedUserName) {
      setIsLoggedIn(true);
      setUserName(storedUserName);
      setCompanyName(storedCompanyName);
    }
  }, []);

  const setAuthState = (loggedIn: boolean, name: string | null, company: string | null) => {
    setIsLoggedIn(loggedIn);
    setUserName(name);
    setCompanyName(company);
    if (name) {
      localStorage.setItem('userName', name);
    } else {
      localStorage.removeItem('userName');
    }
    if (company) {
      localStorage.setItem('companyName', company);
    } else {
      localStorage.removeItem('companyName');
    }
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, userName, companyName, setAuthState }}>
      {children}
    </AuthContext.Provider>
  );
}; 