import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  Button, 
  Stack, 
  Alert, 
  CircularProgress, 
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import { styled } from '@mui/material/styles';
import { useRouter, useSearchParams } from 'next/navigation';
import api, { ProductList } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

const VisuallyHiddenInput = styled('input')({
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: 1,
  overflow: 'hidden',
  position: 'absolute',
  bottom: 0,
  left: 0,
  whiteSpace: 'nowrap',
  width: 1,
});

const UploadSection = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get('inviteCode');
  const { user, logout } = useAuth();
  
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [listName, setListName] = useState<string>('');
  const [uploadComplete, setUploadComplete] = useState<boolean>(false);
  const [loggingOut, setLoggingOut] = useState<boolean>(false);
  
  // For company users - existing product lists
  const [productLists, setProductLists] = useState<ProductList[]>([]);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [loadingLists, setLoadingLists] = useState<boolean>(false);

  // Check if user is a customer
  const isCustomer = user?.user_type?.toUpperCase() === 'CUSTOMER';

  // Fetch existing product lists for company users
  useEffect(() => {
    if (!isCustomer && !inviteCode) {
      fetchProductLists();
    }
  }, [isCustomer, inviteCode]);

  const fetchProductLists = async () => {
    try {
      setLoadingLists(true);
      const response = await api.getProductLists();
      if (response.success) {
        setProductLists(response.data);
      } else {
        setError('Failed to load product lists');
      }
    } catch (err) {
      console.error('Error fetching product lists:', err);
      setError('Failed to load product lists');
    } finally {
      setLoadingLists(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSuccess(null);
    if (event.target.files && event.target.files[0]) {
      const selectedFile = event.target.files[0];
      
      // Check file size (100MB limit)
      if (selectedFile.size > 100 * 1024 * 1024) {
        setError('File size exceeds 100MB limit');
        setFile(null);
        return;
      }
      
      // Check file type (only allow CSV)
      if (!selectedFile.name.endsWith('.csv')) {
        setError('Only CSV files are supported');
        setFile(null);
        return;
      }
      
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    
    // Validate input based on user type
    if (!isCustomer && !inviteCode) {
      if (!selectedListId) {
        setError('Please select a product list');
        return;
      }
    } else if (!inviteCode && !listName.trim()) {
      setError('Please enter a list name');
      return;
    }
    
    setUploading(true);
    setError(null);
    setSuccess(null);
    
    try {
      let newProductListId: number;
      
      // For customers with invite code, we need to get company information first
      if (isCustomer && inviteCode) {
        try {
          // Get company information from invite code to get the product list ID
          const companyInfoResponse = await api.getCompanyByInviteCode(inviteCode);
          
          if (!companyInfoResponse.success || !companyInfoResponse.data?.product_list_id) {
            throw new Error('Failed to get product list information from invite code');
          }
          
          // Use the product list ID from the invite code
          newProductListId = companyInfoResponse.data.product_list_id;
        } catch (err) {
          console.error('Error getting product list from invite code:', err);
          throw new Error('Failed to get product list from invite code. Please contact support.');
        }
      }
      // For company users selecting existing list
      else if (!isCustomer && selectedListId) {
        newProductListId = selectedListId;
      } 
      // For new list creation (company users or customers without invite code)
      else {
        const createResponse = await api.createProductList({ listName });
        
        if (!createResponse.success) {
          throw new Error(createResponse.errMsg || 'Failed to create product list');
        }
        
        newProductListId = createResponse.data.id;
      }
      
      // Get a presigned URL for the file upload
      const presignedResponse = await api.getPresignedUploadUrl(newProductListId, file.name);
      
      if (!presignedResponse.success) {
        throw new Error(presignedResponse.errMsg || 'Failed to get upload URL');
      }
      
      // Upload the file directly to S3
      const uploadResponse = await api.uploadFileToS3(presignedResponse.data.url, file);
      
      if (!uploadResponse.success) {
        throw new Error(uploadResponse.errMsg || 'Failed to upload file');
      }
      
      // Update product list meta with the file path
      const metaResponse = await api.updateProductListMeta(
        newProductListId, 
        presignedResponse.data.key, 
        inviteCode || undefined
      );
      
      if (!metaResponse.success) {
        throw new Error(metaResponse.errMsg || 'Failed to update product metadata');
      }
      
      setSuccess(`File "${file.name}" uploaded successfully!`);
      setFile(null);
      setListName('');
      setSelectedListId(null);
      setUploadComplete(true);
      
      // If user is a customer, start logout process after a short delay
      if (isCustomer) {
        setLoggingOut(true);
        setTimeout(() => {
          logout();
          router.push('/login');
        }, 3000);
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadSample = () => {
    // Open the sample file URL in a new tab
    window.open(api.getSampleFileUrl(), '_blank');
  };

  // If upload is complete, just show the success message
  if (uploadComplete) {
    return (
      <Paper sx={{ width: '100%', p: 4 }}>
        <Typography variant="h6" fontWeight="bold" gutterBottom>
          Upload Complete
        </Typography>
        <Alert severity="success" sx={{ mt: 2 }}>
          {success}
        </Alert>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Your file has been uploaded and is being processed. You&apos;ll be notified when it&apos;s ready.
        </Typography>
        {loggingOut && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Thank you for your upload! You will be logged out in a few seconds...
          </Alert>
        )}
      </Paper>
    );
  }

  // Render appropriate input based on user type
  const renderListInput = () => {
    // 1. Customer with invite code - no list input needed
    if (isCustomer && inviteCode) {
      return null;
    }
    
    // 2. Company user - dropdown to select existing list
    if (!isCustomer && !inviteCode && productLists.length > 0) {
      return (
        <FormControl fullWidth size="small">
          <InputLabel id="product-list-select-label">Select Product List</InputLabel>
          <Select
            labelId="product-list-select-label"
            id="product-list-select"
            value={selectedListId || ''}
            label="Select Product List"
            onChange={(e) => setSelectedListId(e.target.value as number)}
            disabled={uploading || loadingLists}
          >
            {productLists.map((list) => (
              <MenuItem key={list.id} value={list.id}>
                {list.listName}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      );
    }
    
    // 3. New list creation (company user without existing lists or without invite code)
    return (
      <TextField
        label="List Name"
        variant="outlined"
        fullWidth
        value={listName}
        onChange={(e) => setListName(e.target.value)}
        placeholder="Enter a name for this list"
        disabled={uploading}
        size="small"
      />
    );
  };

  return (
    <Paper sx={{ width: '100%', p: 4 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h6" fontWeight="bold">
          Upload File
        </Typography>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={handleDownloadSample}
          size="small"
        >
          Download Sample
        </Button>
      </Stack>
      
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 3, border: '2px dashed #ccc', borderRadius: 2 }}>
        <CloudUploadIcon sx={{ fontSize: 60, mb: 2, color: 'primary.main' }} />
        
        <Typography variant="body1" gutterBottom align="center">
          Drag and drop your CSV file here or click to browse
        </Typography>
        
        <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 2 }}>
          Maximum file size: 100MB or 1 million rows
        </Typography>
        
        <Button
          component="label"
          variant="contained"
          startIcon={<CloudUploadIcon />}
          disabled={uploading}
        >
          Browse Files
          <VisuallyHiddenInput type="file" accept=".csv" onChange={handleFileChange} />
        </Button>
        
        {file && (
          <Stack spacing={2} sx={{ mt: 2, width: '100%', maxWidth: '500px' }}>
            <Typography variant="body2" align="center">
              Selected file: {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
            </Typography>
            
            {renderListInput()}
            
            <Button 
              variant="contained" 
              color="success" 
              onClick={handleUpload}
              disabled={uploading || !file}
              startIcon={uploading ? <CircularProgress size={20} color="inherit" /> : null}
              fullWidth
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </Stack>
        )}
        
        {error && (
          <Alert severity="error" sx={{ mt: 2, width: '100%', maxWidth: '500px' }}>
            {error}
          </Alert>
        )}
        
        {success && !uploadComplete && (
          <Alert severity="success" sx={{ mt: 2, width: '100%', maxWidth: '500px' }}>
            {success}
          </Alert>
        )}
      </Box>
    </Paper>
  );
};

export default UploadSection; 