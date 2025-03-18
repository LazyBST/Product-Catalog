'use client';

import React, { useEffect, useState } from 'react';
import { Container, Typography, Box } from '@mui/material';
import ProductsTable from '@/components/products/ProductsTable';
import { useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function ProductsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const productListId = Number(params.id);
  const productListName = decodeURIComponent(params.name as string);
  const { isLoggedIn } = useAuth();
  const [companyId, setCompanyId] = useState<number | undefined>(undefined);
  const [isCompanyIdReady, setIsCompanyIdReady] = useState<boolean>(false);
  
  // Get company_id from query parameter and localStorage
  useEffect(() => {
    // First try from query parameter
    const companyIdFromQuery = searchParams.get('company_id');
    
    if (companyIdFromQuery) {
      const numCompanyId = Number(companyIdFromQuery);
      setCompanyId(numCompanyId);
      
      // Store for future use
      localStorage.setItem('sharedCompanyId', companyIdFromQuery);
      console.log('Using and storing company ID from URL:', numCompanyId);
      setIsCompanyIdReady(true);
    } else if (isLoggedIn) {
      // For authenticated users, get from their profile
      const authCompanyId = localStorage.getItem('companyId');
      if (authCompanyId) {
        setCompanyId(Number(authCompanyId));
        console.log('Using company ID from authenticated user:', authCompanyId);
        setIsCompanyIdReady(true);
      }
    } else {
      // For unauthenticated users with no query param, try localStorage
      const storedCompanyId = localStorage.getItem('sharedCompanyId');
      if (storedCompanyId) {
        setCompanyId(Number(storedCompanyId));
        console.log('Using company ID from localStorage:', storedCompanyId);
        setIsCompanyIdReady(true);
      } else {
        console.error('No company ID found for access');
      }
    }
  }, [isLoggedIn, searchParams]);

  return (
    <Box>
      <Container maxWidth="lg">
        <Box sx={{ mt: 4, mb: 2 }}>
          <Typography variant="h5" component="h1" gutterBottom>
            Products for: {productListName}
          </Typography>
        </Box>
        <ProductsTable 
          productListId={productListId} 
          productListName={productListName} 
          companyId={companyId} 
          isCompanyIdReady={isCompanyIdReady}
        />
      </Container>
    </Box>
  );
} 