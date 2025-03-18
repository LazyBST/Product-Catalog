'use client';

import React, { useEffect } from 'react';
import { Container, Box, CircularProgress } from '@mui/material';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { isLoggedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Redirect based on authentication status
    if (isLoggedIn) {
      router.push('/dashboard');
    } else {
      // For unauthenticated users, redirect to products list with a default company ID
      // You should replace 1 with your default company ID
      const defaultCompanyId = 1; // Default company ID for public access
      router.push(`/products/1/All-Products?company_id=${defaultCompanyId}`);
    }
  }, [isLoggedIn, router]);

  // Display loading indicator while redirecting
  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 8, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    </Container>
  );
}
