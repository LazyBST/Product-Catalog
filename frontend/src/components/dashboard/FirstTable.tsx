import React, { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Box, Typography, CircularProgress, Button, TextField, Link, Snackbar } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ShareIcon from '@mui/icons-material/Share';
import UploadIcon from '@mui/icons-material/Upload';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import api, { ProductList } from '@/services/api';
import { useRouter } from 'next/navigation';

const FirstTable = () => {
  const router = useRouter();
  const [data, setData] = useState<ProductList[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);
  const [newListName, setNewListName] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [snackbar, setSnackbar] = useState<{open: boolean, message: string, severity: 'success' | 'error'}>({open: false, message: '', severity: 'success'});

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getProductLists();
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

  const handleAddNew = () => {
    setIsAddingNew(true);
    setNewListName('');
  };

  const handleSave = async () => {
    if (!newListName.trim()) {
      setError('List name cannot be empty');
      return;
    }

    setIsSaving(true);
    setError(null);
    
    try {
      const response = await api.createProductList({ listName: newListName });
      
      if (response.success) {
        // Add the new item to the beginning of the list
        setData([response.data, ...data]);
        setIsAddingNew(false);
        setNewListName('');
      } else {
        setError(response.errMsg || 'Failed to create new list');
      }
    } catch (err) {
      console.error('Error creating new list:', err);
      setError('Failed to create new list. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsAddingNew(false);
    setNewListName('');
    setError(null);
  };

  const handleProductListClick = (id: number, name: string) => {
    router.push(`/products/${id}/${encodeURIComponent(name)}`);
  };

  // Format timestamp to readable date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  const handleShareUpload = async(id: number) => {
    const response = await api.generateShareInvite(id)

    const currentUrl = window.location.href;
    const shareLink = `${currentUrl}?inviteCode=${response.data.invite_code}`;
    navigator.clipboard.writeText(shareLink);

    setSnackbar({
      open: true,
      message: 'Share link copied to clipboard!',
      severity: 'success'
    });
  }

  const handleShareList = (id: number, listName: string) => {
    // Create a shareable link to the product page
    const currentOrigin = window.location.origin;
    
    // Get company id from local storage - this is set in the products page
    const companyId = localStorage.getItem('companyId') || localStorage.getItem('company_id');
    
    // Add company_id as query parameter
    const shareLink = `${currentOrigin}/products/${id}/${encodeURIComponent(listName)}?company_id=${companyId}`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(shareLink);
    
    // Show notification
    setSnackbar({
      open: true,
      message: 'Product list link copied to clipboard!',
      severity: 'success'
    });
  }

  return (
    <Paper sx={{ width: '100%', mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2 }}>
        <Typography variant="h6" fontWeight="bold">
          Lists
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddNew}
            disabled={loading || isAddingNew}
            size="small"
          >
            Add New
          </Button>
          <IconButton onClick={handleRefresh} disabled={loading || isAddingNew}>
            {loading ? <CircularProgress size={24} /> : <RefreshIcon />}
          </IconButton>
        </Box>
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
              <TableCell sx={{ fontWeight: 'bold' }}>Created at</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="center">Share Upload</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="center">Share List</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isAddingNew && (
              <TableRow>
                <TableCell>
                  <TextField
                    fullWidth
                    variant="outlined"
                    size="small"
                    placeholder="Enter list name"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    autoFocus
                  />
                </TableCell>
                <TableCell>---</TableCell>
                <TableCell align="center">
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                    onClick={handleSave}
                    disabled={isSaving}
                    size="small"
                  >
                    Save
                  </Button>
                </TableCell>
                <TableCell align="center">
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={handleCancel}
                    disabled={isSaving}
                    size="small"
                  >
                    Cancel
                  </Button>
                </TableCell>
              </TableRow>
            )}
            {loading && !data.length ? (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : data.length === 0 && !isAddingNew ? (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  No lists found
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link 
                      component="button" 
                      variant="body2" 
                      onClick={() => handleProductListClick(row.id, row.listName)}
                      sx={{ 
                        cursor: 'pointer', 
                        textDecoration: 'none',
                        '&:hover': {
                          textDecoration: 'underline',
                        }
                      }}
                    >
                      {row.listName}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDate(row.createdAt)}</TableCell>
                  <TableCell align="center">
                    <IconButton>
                      <UploadIcon onClick={() => handleShareUpload(row.id)}/>
                    </IconButton>
                  </TableCell>
                  <TableCell align="center">
                    <IconButton>
                      <ShareIcon onClick={() => handleShareList(row.id, row.listName)}/>
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({open: false, message: '', severity: 'success'})}
        message={snackbar.message}
      />
    </Paper>
  );
};

export default FirstTable; 