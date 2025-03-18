import { useState, useEffect } from 'react';
import api from '@/services/api';

interface User {
  id: number;
  name: string;
  email?: string;
  companyId: number;
  company_name: string;
  user_type?: string;
  product_list_id?: number;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if token exists in localStorage
    const token = localStorage.getItem('token');
    if (token) {
      // Simple validation - in a real app, validate the token by calling an API
      try {
        const userData = {
          id: Number(localStorage.getItem('userId') || 0),
          name: localStorage.getItem('userName') || '',
          companyId: Number(localStorage.getItem('companyId') || 0),
          company_name: localStorage.getItem('companyName') || '',
          user_type: localStorage.getItem('userType') || 'COMPANY_USER'
        };
        
        setUser(userData);
        setIsAuthenticated(true);
      } catch (error) {
        // Invalid user data in localStorage
        localStorage.removeItem('token');
      }
    }
    
    setLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    setLoading(true);
    try {
      const response = await api.login({ username, password });
      
      if (response.success) {
        const userData = response.data.user;
        setUser(userData);
        
        // Store user data in localStorage for persistence
        localStorage.setItem('userId', String(userData.id));
        localStorage.setItem('userName', userData.name);
        localStorage.setItem('companyId', String(userData.companyId));
        localStorage.setItem('companyName', userData.company_name);
        if (userData.user_type) {
          localStorage.setItem('userType', userData.user_type);
        }
        
        setIsAuthenticated(true);
        return { success: true };
      } else {
        return { success: false, error: response.errMsg };
      }
    } catch (error) {
      return { success: false, error: 'Login failed' };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    api.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  return {
    user,
    loading,
    isAuthenticated,
    login,
    logout
  };
} 