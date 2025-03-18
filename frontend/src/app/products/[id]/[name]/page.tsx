'use client';

import React from 'react';
import { Container, Typography, Box } from '@mui/material';
import ProductsTable from '@/components/products/ProductsTable';
import { useParams } from 'next/navigation';

export default function ProductsPage() {
  const params = useParams();
  const productListId = Number(params.id);
  const productListName = decodeURIComponent(params.name as string);

  return (
    <Box>
      <Container maxWidth="lg">
        <Box sx={{ mt: 4, mb: 2 }}>
          <Typography variant="h5" component="h1" gutterBottom>
            Products for: {productListName}
          </Typography>
        </Box>
        <ProductsTable productListId={productListId} productListName={productListName} />
      </Container>
    </Box>
  );
} 