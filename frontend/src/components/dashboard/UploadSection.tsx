import React, { useState } from 'react';
import { Box, Paper, Typography, Button, Stack, Alert, CircularProgress, TextField } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { styled } from '@mui/material/styles';
import api from '@/services/api';

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
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [listName, setListName] = useState<string>('');

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
      
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    
    if (!listName.trim()) {
      setError('Please enter a list name');
      return;
    }
    
    setUploading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await api.uploadFile(file, listName);
      
      if (response.success) {
        setSuccess(`File "${file.name}" uploaded successfully!`);
        setFile(null);
        setListName('');
      } else {
        setError(response.errMsg || 'Failed to upload file');
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      setError('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Paper sx={{ width: '100%', p: 4 }}>
      <Typography variant="h6" fontWeight="bold" gutterBottom>
        Upload File
      </Typography>
      
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 3, border: '2px dashed #ccc', borderRadius: 2 }}>
        <CloudUploadIcon sx={{ fontSize: 60, mb: 2, color: 'primary.main' }} />
        
        <Typography variant="body1" gutterBottom align="center">
          Drag and drop your file here or click to browse
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
          <VisuallyHiddenInput type="file" onChange={handleFileChange} />
        </Button>
        
        {file && (
          <Stack spacing={2} sx={{ mt: 2, width: '100%', maxWidth: '500px' }}>
            <Typography variant="body2" align="center">
              Selected file: {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
            </Typography>
            
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
        
        {success && (
          <Alert severity="success" sx={{ mt: 2, width: '100%', maxWidth: '500px' }}>
            {success}
          </Alert>
        )}
      </Box>
    </Paper>
  );
};

export default UploadSection; 