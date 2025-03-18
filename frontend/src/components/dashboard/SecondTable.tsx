import React, { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Box, Typography, CircularProgress } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import api, { ProductPipeline } from '@/services/api';

const SecondTable = () => {
  const [data, setData] = useState<ProductPipeline[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getProductListPipeline();
      if (response.success) {
        setData(response.data);
      } else {
        setError(response.errMsg || 'Failed to fetch data');
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to connect to the server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    fetchData();
  };

  // Format timestamp to readable date
  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  return (
    <Paper sx={{ width: '100%', mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2 }}>
        <Typography variant="h6" fontWeight="bold">
          Batches
        </Typography>
        <IconButton onClick={handleRefresh} disabled={loading}>
          {loading ? <CircularProgress size={24} /> : <RefreshIcon />}
        </IconButton>
      </Box>
      {error && (
        <Box sx={{ p: 2, color: 'error.main' }}>
          <Typography>{error}</Typography>
        </Box>
      )}
      <TableContainer>
        <Table>
          <TableHead sx={{ backgroundColor: 'rgba(0, 0, 0, 0.1)' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>List name</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Total batches</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Processed batches</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Last processed at</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Created at</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && !data.length ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  No pipeline data found
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.listName}</TableCell>
                  <TableCell>{row.total_batches || 0}</TableCell>
                  <TableCell>{row.processed_batches || 0}</TableCell>
                  <TableCell>{formatDate(row.last_processed_at)}</TableCell>
                  <TableCell>{formatDate(row.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default SecondTable; 