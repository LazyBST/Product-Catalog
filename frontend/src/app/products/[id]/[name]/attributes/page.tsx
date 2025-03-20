'use client';

import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Typography, 
  Box, 
  Card, 
  Tabs, 
  Tab, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow, 
  Paper, 
  Switch, 
  IconButton,
  Drawer,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  FormControlLabel,
  Divider,
  Chip,
  CircularProgress,
  Alert
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useParams, useRouter } from 'next/navigation';
import api, { Attribute, AttributeCreateRequest, AttributeUpdateRequest, ApiResponse } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

export default function AttributesPage() {
  const params = useParams();
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  
  // Define all state hooks at the top level, regardless of auth status
  const [tabValue, setTabValue] = useState(0);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [systemAttributes, setSystemAttributes] = useState<Attribute[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAttribute, setSelectedAttribute] = useState<Attribute | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [companyId, setCompanyId] = useState<number | undefined>(undefined);
  
  // Get product list info from params
  const productListId = Number(params.id);
  const productListName = decodeURIComponent(params.name as string);
  
  // Get company ID from localStorage
  useEffect(() => {
    if (isLoggedIn) {
      const storedCompanyId = localStorage.getItem('companyId');
      if (storedCompanyId) {
        setCompanyId(Number(storedCompanyId));
        console.log('Using company ID from authenticated user:', storedCompanyId);
      }
    }
  }, [isLoggedIn]);
  
  // Redirect to products page if user is not authenticated
  useEffect(() => {
    if (!isLoggedIn) {
      router.push(`/products/${params.id}/${params.name}`);
    }
  }, [isLoggedIn, router, params.id, params.name]);
  
  // Load attributes from API only when logged in AND companyId is available
  useEffect(() => {
    if (!isLoggedIn || !companyId) return;
    
    const fetchAttributes = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await api.getAttributes(productListId, companyId);
        
        if (response.success) {
          setSystemAttributes(response.data.systemAttributes);
          setAttributes(response.data.customAttributes);
        } else {
          setError(response.errMsg || 'Failed to fetch attributes');
        }
      } catch (err) {
        console.error('Error fetching attributes:', err);
        setError('Failed to connect to the server');
      } finally {
        setLoading(false);
      }
    };
    
    fetchAttributes();
  }, [productListId, isLoggedIn, companyId]);

  // If not logged in, show loading indicator (will redirect)
  if (!isLoggedIn) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ mt: 4, mb: 2, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const filteredAttributes = () => {
    switch (tabValue) {
      case 0: // System attributes
        return systemAttributes;
      case 1: // Custom attributes
        return attributes;
      case 2: // All attributes
      default:
        return [...systemAttributes, ...attributes];
    }
  };

  const handleEditClick = (attribute: Attribute) => {
    setSelectedAttribute(attribute);
    setDrawerOpen(true);
    setValidationErrors({});
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setSelectedAttribute(null);
    setValidationErrors({});
  };

  const handleAttributeChange = (field: keyof Attribute, value: string | boolean | string[]) => {
    if (!selectedAttribute) return;
    
    // Clear validation error when field is being edited
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
    
    setSelectedAttribute({
      ...selectedAttribute,
      [field]: value
    });
  };

  const validateAttribute = (attribute: Attribute): boolean => {
    const errors: Record<string, string> = {};
    
    if (!attribute.name.trim()) {
      errors.name = 'Name is required';
    }
    
    if (!attribute.isSystem && !attribute.group.trim()) {
      errors.group = 'Group is required';
    }
    
    if (!attribute.type) {
      errors.type = 'Type is required';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveAttribute = async () => {
    if (!selectedAttribute) return;
    
    if (!validateAttribute(selectedAttribute)) {
      return;
    }
    
    setIsSaving(true);
    
    try {
      let response: ApiResponse<Attribute> | undefined;
      
      // New attribute (id is a string for system attributes)
      if (typeof selectedAttribute.id === 'string' && selectedAttribute.id.startsWith('new-')) {
        const createData: AttributeCreateRequest = {
          name: selectedAttribute.name,
          group: selectedAttribute.group,
          type: selectedAttribute.type as 'text' | 'number' | 'single_select' | 'multiple_select',
          options: selectedAttribute.options,
          prompt: selectedAttribute.prompt,
          isAiEnriched: selectedAttribute.isAiEnriched,
          isSortable: selectedAttribute.isSortable,
          isFilterable: selectedAttribute.isFilterable
        };
        
        response = await api.createAttribute(productListId, createData);
        
        if (response && response.success && response.data) {
          setAttributes(prev => [...prev, response!.data]);
        }
      } else if (typeof selectedAttribute.id === 'number') {
        // Updating existing attribute
        const updateData: AttributeUpdateRequest = {
          name: selectedAttribute.name,
          group: selectedAttribute.group,
          type: selectedAttribute.type as 'text' | 'number' | 'single_select' | 'multiple_select',
          options: selectedAttribute.options,
          prompt: selectedAttribute.prompt,
          isAiEnriched: selectedAttribute.isAiEnriched,
          isSortable: selectedAttribute.isSortable,
          isFilterable: selectedAttribute.isFilterable
        };
        
        response = await api.updateAttribute(
          productListId, 
          selectedAttribute.id, 
          updateData
        );
        
        if (response && response.success) {
          // setAttributes(prev => 
          //   prev.map(attr => 
          //     attr.id === selectedAttribute.id ? response.data : attr
          //   )
          // );

          // Fetch all attributes again
          const refreshResponse = await api.getAttributes(productListId, companyId);
          if (refreshResponse.success) {
            setAttributes(refreshResponse.data.customAttributes);
          }
        }
      }
      
      // If we got an error from the API
      if (response && !response.success) {
        setError(response.errMsg || 'Failed to save attribute');
        return;
      }
      
      // Close drawer on success
      setDrawerOpen(false);
      setSelectedAttribute(null);
      
    } catch (err) {
      console.error('Error saving attribute:', err);
      setError('Failed to save attribute');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAttribute = async () => {
    if (!selectedAttribute || typeof selectedAttribute.id !== 'number') return;
    
    // Don't allow deletion of system attributes
    if (selectedAttribute.isSystem) {
      alert("System attributes cannot be deleted.");
      return;
    }
    
    setIsSaving(true);
    
    try {
      const response = await api.deleteAttribute(productListId, selectedAttribute.id);
      
      if (response.success) {
        setAttributes(prev => 
          prev.filter(attr => attr.id !== selectedAttribute.id)
        );
        
        setDrawerOpen(false);
        setSelectedAttribute(null);
      } else {
        setError(response.errMsg || 'Failed to delete attribute');
      }
    } catch (err) {
      console.error('Error deleting attribute:', err);
      setError('Failed to delete attribute');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle attribute toggle switches in the table
  const handleAttributeToggle = async (id: number | string, field: 'isAiEnriched' | 'isSortable' | 'isFilterable', value: boolean) => {
    // Don't allow toggling system attributes
    const attribute = [...systemAttributes, ...attributes].find(attr => attr.id === id);
    if (attribute?.isSystem) return;
    
    // Only handle numeric IDs (custom attributes)
    if (typeof id !== 'number') return;
    
    try {
      const response = await api.toggleAttributeField(productListId, id, field, value);
      
      if (response.success) {
        setAttributes(prev => 
          prev.map(attr => 
            attr.id === id ? { ...attr, [field]: value } : attr
          )
        );
      } else {
        // If toggle failed, refresh attributes
        const refreshResponse = await api.getAttributes(productListId, companyId);
        if (refreshResponse.success) {
          setAttributes(refreshResponse.data.customAttributes);
        }
      }
    } catch (err) {
      console.error(`Error toggling ${field}:`, err);
      setError(`Failed to update attribute`);
    }
  };

  const createNewAttribute = () => {
    const newAttribute: Attribute = {
      id: `new-${Date.now()}`,
      name: '',
      group: '',
      options: [],
      prompt: '',
      isAiEnriched: false,
      isSortable: false,
      isFilterable: false,
      isRequired: false,
      isMultiValue: false,
      isSystem: false,
      type: 'text'
    };
    setSelectedAttribute(newAttribute);
    setDrawerOpen(true);
    setValidationErrors({});
  };

  const handleSuggestAttributes = async () => {
    setIsSuggesting(true);
    setError(null);
    
    try {
      const response: ApiResponse<Attribute[]> = await api.suggestAttributes(productListId);
      
      if (response.success && response.data) {
        // Add the new suggested attributes to the existing ones
        setAttributes(prev => [...prev, ...response.data]);
      } else {
        setError(response.errMsg || 'Failed to suggest attributes');
      }
    } catch (err) {
      console.error('Error suggesting attributes:', err);
      setError('Failed to suggest attributes');
    } finally {
      setIsSuggesting(false);
    }
  };

  return (
    <Box>
      <Container maxWidth="lg">
        <Box sx={{ mt: 4, mb: 2 }}>
          <Typography variant="h5" component="h1" gutterBottom>
            Attributes for: {productListName}
          </Typography>
        </Box>
        
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}
        
        {/* Tabs Card */}
        <Card sx={{ mb: 3 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={tabValue} onChange={handleTabChange} aria-label="attributes tabs">
              <Tab label="System Attributes" />
              <Tab label="Custom Attributes" />
              <Tab label="All Attributes" />
            </Tabs>
          </Box>
        </Card>
        
        {/* Add Custom Attribute Button - Only show on Custom tab */}
        {tabValue === 1 && (
          <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button 
              variant="outlined" 
              startIcon={isSuggesting ? <CircularProgress size={20} /> : <AutoFixHighIcon />}
              onClick={handleSuggestAttributes}
              disabled={isSuggesting}
              title="Suggest attributes using AI"
            >
              Suggest with AI
            </Button>
            <Button 
              variant="contained" 
              onClick={createNewAttribute}
            >
              Add Custom Attribute
            </Button>
          </Box>
        )}
        
        {/* Table Card */}
        <Card>
          <Box sx={{ p: 2 }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
              </Box>
            ) : filteredAttributes()?.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="body1" color="text.secondary">
                  {tabValue === 0 
                    ? 'No system attributes found' 
                    : tabValue === 1 
                      ? 'No custom attributes found' 
                      : 'No attributes found'}
                </Typography>
              </Box>
            ) : (
              <AttributesTable 
                attributes={filteredAttributes()} 
                onEditClick={handleEditClick}
                onToggle={handleAttributeToggle}
              />
            )}
          </Box>
        </Card>
      </Container>
      
      {/* Edit Drawer */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={handleDrawerClose}
      >
        <Box sx={{ width: 400, p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6">
              {selectedAttribute?.id 
                ? typeof selectedAttribute.id === 'string' && selectedAttribute.id.startsWith('new-')
                  ? 'New Attribute'
                  : 'Edit Attribute'
                : 'Attribute'}
            </Typography>
            <IconButton onClick={handleDrawerClose} disabled={isSaving}>
              <CloseIcon />
            </IconButton>
          </Box>
          
          {selectedAttribute && (
            <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label={
                  <Box component="span">
                    Attribute Name
                    <Box component="span" sx={{ color: 'error.main', ml: 0.5 }}>*</Box>
                  </Box>
                }
                value={selectedAttribute.name}
                onChange={(e) => handleAttributeChange('name', e.target.value)}
                fullWidth
                required
                error={!!validationErrors.name}
                helperText={validationErrors.name}
                disabled={selectedAttribute.isSystem || isSaving}
              />
              
              <TextField
                label={
                  <Box component="span">
                    Attribute Group
                    {!selectedAttribute.isSystem && (
                      <Box component="span" sx={{ color: 'error.main', ml: 0.5 }}>*</Box>
                    )}
                  </Box>
                }
                value={selectedAttribute.group}
                onChange={(e) => handleAttributeChange('group', e.target.value)}
                fullWidth
                required={!selectedAttribute.isSystem}
                error={!!validationErrors.group}
                helperText={validationErrors.group}
                disabled={selectedAttribute.isSystem || isSaving}
              />
              
              <FormControl 
                fullWidth 
                error={!!validationErrors.type}
                disabled={selectedAttribute.isSystem || isSaving}
              >
                <InputLabel>
                  Type
                  <Box component="span" sx={{ color: 'error.main', ml: 0.5, display: 'inline' }}>*</Box>
                </InputLabel>
                <Select
                  value={selectedAttribute.type}
                  label="Type *"
                  onChange={(e) => handleAttributeChange('type', e.target.value)}
                >
                  <MenuItem value="text">Text</MenuItem>
                  <MenuItem value="number">Number</MenuItem>
                  <MenuItem value="single_select">Single Select</MenuItem>
                  <MenuItem value="multiple_select">Multiple Select</MenuItem>
                </Select>
                {validationErrors.type && (
                  <Typography color="error" variant="caption">
                    {validationErrors.type}
                  </Typography>
                )}
              </FormControl>
              
              {(selectedAttribute.type === 'single_select' || selectedAttribute.type === 'multiple_select') && (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Options
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                    {selectedAttribute.options.map((option, index) => (
                      <Chip
                        key={index}
                        label={option}
                        onDelete={() => {
                          if (isSaving) return;
                          
                          const newOptions = [...selectedAttribute.options];
                          newOptions.splice(index, 1);
                          handleAttributeChange('options', newOptions);
                        }}
                        size="small"
                        disabled={selectedAttribute.isSystem || isSaving}
                      />
                    ))}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                      placeholder="Add option"
                      size="small"
                      id="new-option"
                      disabled={selectedAttribute.isSystem || isSaving}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => {
                        if (isSaving) return;
                        
                        const input = document.getElementById('new-option') as HTMLInputElement;
                        if (input.value.trim()) {
                          handleAttributeChange('options', [...selectedAttribute.options, input.value.trim()]);
                          input.value = '';
                        }
                      }}
                      disabled={selectedAttribute.isSystem || isSaving}
                    >
                      Add
                    </Button>
                  </Box>
                </Box>
              )}
              
              <TextField
                label="AI Enrichment Prompt"
                value={selectedAttribute.prompt}
                onChange={(e) => handleAttributeChange('prompt', e.target.value)}
                fullWidth
                multiline
                rows={4}
                disabled={selectedAttribute.isSystem || isSaving}
              />
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Settings
                </Typography>
                <FormControlLabel
                  control={
                    <Switch
                      checked={selectedAttribute.isAiEnriched}
                      onChange={(e) => handleAttributeChange('isAiEnriched', e.target.checked)}
                      disabled={selectedAttribute.isSystem || isSaving}
                    />
                  }
                  label="AI Enrichment"
                />
                
                <FormControlLabel
                  control={
                    <Switch
                      checked={selectedAttribute.isSortable}
                      onChange={(e) => handleAttributeChange('isSortable', e.target.checked)}
                      disabled={isSaving}
                    />
                  }
                  label="Sortable"
                />
                
                <FormControlLabel
                  control={
                    <Switch
                      checked={selectedAttribute.isFilterable}
                      onChange={(e) => handleAttributeChange('isFilterable', e.target.checked)}
                      disabled={isSaving}
                    />
                  }
                  label="Filterable"
                />
              </Box>
              
              <Divider sx={{ my: 2 }} />
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                {!selectedAttribute.isSystem && 
                 typeof selectedAttribute.id === 'number' && (
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={handleDeleteAttribute}
                    disabled={isSaving}
                  >
                    Delete
                  </Button>
                )}
                <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
                  <Button 
                    variant="outlined" 
                    onClick={handleDrawerClose}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button 
                    variant="contained" 
                    onClick={handleSaveAttribute}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <CircularProgress size={24} color="inherit" />
                    ) : 'Save'}
                  </Button>
                </Box>
              </Box>
            </Box>
          )}
        </Box>
      </Drawer>
    </Box>
  );
}

// Attributes Table component
function AttributesTable({ 
  attributes, 
  onEditClick,
  onToggle
}: { 
  attributes: Attribute[],
  onEditClick: (attribute: Attribute) => void,
  onToggle: (id: number | string, field: 'isAiEnriched' | 'isSortable' | 'isFilterable', value: boolean) => void
}) {
  return (
    <TableContainer component={Paper} elevation={0}>
      <Table aria-label="attributes table">
        <TableHead sx={{ 
          backgroundColor: 'rgba(0, 0, 0, 0.1)',
        }}>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>Attribute Name</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Attribute Group</TableCell>
            <TableCell align="center" sx={{ fontWeight: 'bold' }}>AI Enrichment</TableCell>
            <TableCell align="center" sx={{ fontWeight: 'bold' }}>Sortable</TableCell>
            <TableCell align="center" sx={{ fontWeight: 'bold' }}>Filterable</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Options</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Prompt</TableCell>
            <TableCell align="center" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {attributes?.map((attr) => (
            <TableRow key={attr.id}>
              <TableCell>{attr.name}</TableCell>
              <TableCell>{attr.group}</TableCell>
              <TableCell align="center">
                <Switch 
                  checked={attr.isAiEnriched} 
                  disabled={attr.isSystem}
                  size="small"
                  onChange={(e) => onToggle(attr.id, 'isAiEnriched', e.target.checked)}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-disabled': {
                      color: attr.isSystem ? 'rgba(0, 0, 0, 0.26)' : undefined
                    }
                  }}
                />
              </TableCell>
              <TableCell align="center">
                <Switch 
                  checked={attr.isSortable} 
                  size="small"
                  onChange={(e) => onToggle(attr.id, 'isSortable', e.target.checked)}
                  disabled={attr.isSystem}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-disabled': {
                      color: attr.isSystem ? 'rgba(0, 0, 0, 0.26)' : undefined
                    }
                  }}
                />
              </TableCell>
              <TableCell align="center">
                <Switch 
                  checked={attr.isFilterable} 
                  size="small"
                  onChange={(e) => onToggle(attr.id, 'isFilterable', e.target.checked)}
                  disabled={attr.isSystem}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-disabled': {
                      color: attr.isSystem ? 'rgba(0, 0, 0, 0.26)' : undefined
                    }
                  }}
                />
              </TableCell>
              <TableCell>
                {attr.options?.length > 0 ? (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {attr.options.map((option, index) => (
                      <Chip key={index} label={option} size="small" />
                    ))}
                  </Box>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell sx={{
                maxWidth: 250,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                // display: '-webkit-box',
                // WebkitLineClamp: 3,
                // WebkitBoxOrient: 'vertical',
                lineHeight: '1.2em',
                maxHeight: '3.6em'
              }}>
                {attr.prompt || '-'}
              </TableCell>
              <TableCell align="center">
                <IconButton 
                  size="small" 
                  onClick={() => onEditClick(attr)}
                  disabled={attr.isSystem}
                  sx={{ 
                    color: attr.isSystem ? 'rgba(0, 0, 0, 0.26)' : undefined 
                  }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
} 