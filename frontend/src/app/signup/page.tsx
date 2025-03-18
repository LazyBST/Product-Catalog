'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Container, Box, Typography, TextField, Button, Alert, CircularProgress } from '@mui/material';
import Link from 'next/link';
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
  const [companyInfo, setCompanyInfo] = useState<{ company_id: number, company_name: string } | null>(null);
  const [inviteCodeValid, setInviteCodeValid] = useState<boolean | null>(inviteCode ? null : true);
  const [checkingInviteCode, setCheckingInviteCode] = useState(!!inviteCode);

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  // Check invite code validity
  const checkInviteCodeValidity = async (code: string) => {
    setCheckingInviteCode(true);
    
    try {
      const response = await api.checkInviteCodeValidity(code);
      
      if (response.success && response.data) {
        setInviteCodeValid(response.data.isValid);
        
        if (!response.data.isValid) {
          setError('This invite code is invalid or has expired');
          return false;
        }
        return true;
      } else {
        setInviteCodeValid(false);
        setError('Could not validate invite code');
        return false;
      }
    } catch (err) {
      console.error('Error checking invite code:', err);
      setInviteCodeValid(false);
      setError('Error validating invite code');
      return false;
    } finally {
      setCheckingInviteCode(false);
    }
  };

  // Fetch company info from invite code if present
  useEffect(() => {
    if (inviteCode) {
      const validateAndFetchCompanyInfo = async () => {
        const isValid = await checkInviteCodeValidity(inviteCode);
        if (isValid) {
          fetchCompanyInfo(inviteCode);
        }
      };
      
      validateAndFetchCompanyInfo();
    }
  }, [inviteCode]);

  // Fetch company info from invite code
  const fetchCompanyInfo = async (code: string) => {
    setCompanyLoading(true);
    try {
      const response = await api.getCompanyByInviteCode(code);
      if (response.success) {
        setCompanyInfo(response.data);
        setCompanyName(response.data.company_name);
      } else {
        setError(response.errMsg || 'Invalid invite code');
      }
    } catch (error) {
      console.error('Failed to load company information:', error);
      setError('Failed to load company information');
    } finally {
      setCompanyLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (inviteCode && !inviteCodeValid) {
      setError('Cannot sign up with an invalid invite code');
      return;
    }
    
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
        // Preserve all query parameters when redirecting
        const queryParams = new URLSearchParams(window.location.search);
        const redirectUrl = queryParams?.toString() ? `/dashboard?${queryParams?.toString()}` : '/dashboard';
        router.push(redirectUrl);
      } else {
        setError(response.errMsg || 'Signup failed');
      }
    } catch (err) {
      console.error('Signup error:', err);
      setError('An error occurred during signup');
    } finally {
      setLoading(false);
    }
  };

  // Generate login link with invite code if present
  const loginLink = inviteCode ? `/login?inviteCode=${inviteCode}` : '/login';

  // Show loading state while checking invite code
  if (checkingInviteCode) {
    return (
      <Container maxWidth="sm">
        <Box sx={{ mt: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography component="h1" variant="h5">
            Sign Up
          </Typography>
          <CircularProgress sx={{ mt: 4 }} />
          <Typography sx={{ mt: 2 }}>Validating invite code...</Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography component="h1" variant="h5">
          Sign Up
        </Typography>
        
        {inviteCode && inviteCodeValid === false && (
          <Alert severity="error" sx={{ mt: 2, width: '100%' }}>
            This invite code is invalid or has expired. Please contact your administrator.
          </Alert>
        )}
        
        {inviteCode && inviteCodeValid && companyInfo && (
          <Box mt={2} width="100%">
            {companyLoading ? (
              <CircularProgress size={24} />
            ) : (
              <Alert severity="info">
                You&apos;ve been invited to join {companyInfo.company_name}
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
            disabled={loading || (!!inviteCode && inviteCodeValid === false)}
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
            disabled={loading || (!!inviteCode && inviteCodeValid === false)}
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
            disabled={loading || (!!inviteCode && inviteCodeValid === false)}
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
            disabled={!!inviteCode || loading || (!!inviteCode && inviteCodeValid === false)}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={loading || (!!inviteCode && inviteCodeValid === false) || (!!inviteCode && !companyInfo)}
          >
            {loading ? <CircularProgress size={24} /> : 'Sign Up'}
          </Button>
          <Box sx={{ textAlign: 'center' }}>
            <Link href={loginLink}>
              <Typography variant="body2">
                Already have an account? Sign in
              </Typography>
            </Link>
          </Box>
        </Box>
      </Box>
    </Container>
  );
};

export default SignUp; 