'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Container, Box, Typography, TextField, Button, Link, Alert, CircularProgress } from '@mui/material';
import api from '@/services/api';
import { useAuth } from '@/hooks/useAuth';

const SignUp = () => {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get('inviteCode');
  
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<{ id: number, company_name: string } | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  // Fetch company info from invite code
  useEffect(() => {
    if (inviteCode) {
      const fetchCompanyInfo = async () => {
        setCompanyLoading(true);
        try {
          const response = await api.getCompanyByInviteCode(inviteCode);
          console.log({response})
          if (response.data.company_name) {
            setCompanyName(response.data.company_name);
            // prefill company name
            setCompanyInfo({
              id: response.data.company_id,
              company_name: response.data.company_name,
            });
          } else {
            setError(response.errMsg || 'Invalid invite code');
          }
        } catch (error) {
          setError('Failed to load company information');
        } finally {
          setCompanyLoading(false);
        }
      };

      fetchCompanyInfo();
    }
  }, [inviteCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.signup({
        name,
        username,
        password,
        company_name: companyName,
        inviteCode: inviteCode || undefined
      });

      if (response.success) {
        router.push('/dashboard');
      } else {
        setError(response.errMsg || 'Signup failed');
      }
    } catch (err: any) {
      setError('An error occurred during signup');
    } finally {
      setLoading(false);
    }
  };

  const redirectToLogin = () => {
    // attach whatever query params are in the url to the redirect url
    const queryParams = new URLSearchParams(window.location.search);
    const redirectUrl = `/login?${queryParams.toString()}`;
    router.push(redirectUrl);
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography component="h1" variant="h5">
          Sign Up
        </Typography>
        
        {inviteCode && (
          <Box mt={2} width="100%">
            {companyLoading ? (
              <CircularProgress size={24} />
            ) : companyInfo ? (
              <Alert severity="info">
                You&apos;ve been invited to join {companyInfo.company_name}
              </Alert>
            ) : (
              <Alert severity="warning">
                Invalid invite code
              </Alert>
            )}
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2, width: '100%' }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 3, width: '100%' }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="name"
            label="Full Name"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <TextField
            margin="normal"
            required
            fullWidth
            id="username"
            label="Username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Password"
            type="password"
            id="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            id="companyName"
            label="Company Name"
            name="companyName"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            disabled={!!inviteCode}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={loading || (inviteCode && !companyInfo)}
          >
            {loading ? <CircularProgress size={24} /> : 'Sign Up'}
          </Button>
          <Box sx={{ textAlign: 'center' }}>
            <Link onClick={redirectToLogin} variant="body2" sx={{ cursor: 'pointer' }}>
              Already have an account? Sign in
            </Link>
          </Box>
        </Box>
      </Box>
    </Container>
  );
};

export default SignUp; 