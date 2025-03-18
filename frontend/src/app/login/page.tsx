'use client';

import React, { useState } from 'react';
import { Box, Container, TextField, Button, Typography, Paper, Stack, CircularProgress } from '@mui/material';
import { useRouter } from 'next/navigation';
import api from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { setAuthState } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      setError('Username and password are required');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await api.login({ username, password });
      
      if (response.success && response.data) {
        setAuthState(true, response.data.user.name, response.data.user.company_name);
        router.push('/dashboard');
      } else {
        setError(response.errMsg || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setUsername('guest_user');
    setPassword('guest_password');
    
    setLoading(true);
    setError('');
    
    try {
      const response = await api.login({ 
        username: 'guest_user', 
        password: 'guest_password' 
      });
      
      if (response.success && response.data) {
        setAuthState(true, response.data.user.name, response.data.user.company_name);
        router.push('/dashboard');
      } else {
        setError(response.errMsg || 'Guest login failed');
      }
    } catch (error) {
      console.error('Guest login error:', error);
      setError('An error occurred during guest login');
    } finally {
      setLoading(false);
    }
  };

  const goToSignup = () => {
    // attach whatever query params are in the url to the redirect url
    const queryParams = new URLSearchParams(window.location.search);
    const redirectUrl = `/signup?${queryParams.toString()}`;
    router.push(redirectUrl);
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography 
          variant="h4" 
          component="h1" 
          sx={{ 
            mb: 4, 
            fontWeight: 'bold',
            color: 'primary.main'
          }}
        >
          AI-ventory
        </Typography>
        
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Typography variant="h5" component="h2" sx={{ mb: 3, textAlign: 'center' }}>
            Login
          </Typography>
          
          {error && (
            <Typography color="error" sx={{ mb: 2 }}>
              {error}
            </Typography>
          )}
          
          <Box component="form" onSubmit={handleLogin}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="username"
              label="Username"
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
            />
            
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
            
            <Stack spacing={2} sx={{ mt: 3 }}>
              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
              >
                {loading ? <CircularProgress size={24} /> : 'Login'}
              </Button>
              
              {/* user is not a customer */}
              {user?.user_type?.toLowerCase() !== "customer" && (
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={handleGuestLogin}
                  disabled={loading}
              >
                Guest Login
              </Button>
              )}
              
              <Button
                fullWidth
                color="secondary"
                onClick={goToSignup}
                disabled={loading}
              >
                Sign Up
              </Button>
            </Stack>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
} 