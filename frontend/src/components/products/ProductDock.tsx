import React, { useState, useEffect } from 'react';
import {
  Drawer,
  Typography,
  Box,
  TextField,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Grid,
  Alert,
  FormControlLabel,
  Switch,
  MenuItem
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import api, { Product, Attribute } from '@/services/api';

interface ProductDockProps {
  open: boolean;
  onClose: () => void;
  productListId: number;
  productId?: number; // Optional - if provided, we're editing an existing product
  onSaved: () => void;
}

const ProductDock: React.FC<ProductDockProps> = ({ open, onClose, productListId, productId, onSaved }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  
  // Product data
  const [product, setProduct] = useState<Partial<Product>>({
    name: '',
    brand: '',
    barcode: '',
    image_url: '',
    attribute_values: {}
  });

  // Form validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load product data and attributes when opened
  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, productId, productListId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Load attributes
      const attributesResponse = await api.getAttributes(productListId);
      if (attributesResponse.success) {
        // Use only custom attributes
        const customAttributes = attributesResponse.data.customAttributes || [];
        setAttributes(customAttributes);
      }

      // If we're editing an existing product, load its data
      if (productId) {
        const productResponse = await api.getProduct(productListId, productId);
        if (productResponse.success) {
          setProduct(productResponse.data);
        } else {
          setError(productResponse.errMsg || 'Failed to load product');
        }
      } else {
        // Reset product for new creation
        setProduct({
          name: '',
          brand: '',
          barcode: '',
          image_url: '',
          attribute_values: {}
        });
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProduct(prev => ({ ...prev, [name]: value }));
    
    // Clear validation error when field is edited
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleAttributeChange = (attributeId: string | number, value: string | string[]) => {
    setProduct(prev => ({
      ...prev,
      attribute_values: {
        ...prev.attribute_values,
        [attributeId.toString()]: value
      }
    }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    // Validate required fields
    if (!product.name?.trim()) {
      newErrors.name = 'Product name is required';
    }
    
    if (!product.barcode?.trim()) {
      newErrors.barcode = 'Barcode is required';
    }
    
    // Check required attributes
    attributes.forEach(attr => {
      if (attr.isRequired && 
          (!product.attribute_values || 
           !product.attribute_values[attr.id.toString()] || 
           !product.attribute_values[attr.id.toString()]?.trim())) {
        newErrors[`attr_${attr.id}`] = `${attr.name} is required`;
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }
    
    setSaving(true);
    setError(null);
    
    try {
      let response;
      
      if (productId) {
        // Update existing product
        response = await api.updateProduct(productListId, productId, product);
      } else {
        // Create new product
        response = await api.createProduct(productListId, product as Omit<Product, 'id' | 'created_at' | 'is_ai_enriched'>);
      }
      
      if (response.success) {
        onSaved();
        onClose();
      } else {
        setError(response.errMsg || 'Failed to save product');
      }
    } catch (err) {
      console.error('Error saving product:', err);
      setError('Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': { 
          width: {
            xs: '100%',
            sm: '600px'
          },
          p: 3
        },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight="bold">
          {productId ? 'Edit Product' : 'Create Product'}
        </Typography>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 5 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box sx={{ maxHeight: 'calc(100vh - 180px)', overflow: 'auto' }}>
          {/* Basic Information Section */}
          <Typography variant="h6" sx={{ mb: 2, mt: 2 }}>
            Basic Information
          </Typography>
          
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                label="Product Name"
                name="name"
                value={product.name || ''}
                onChange={handleChange}
                fullWidth
                required
                error={!!errors.name}
                helperText={errors.name}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Brand"
                name="brand"
                value={product.brand || ''}
                onChange={handleChange}
                fullWidth
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Barcode"
                name="barcode"
                value={product.barcode || ''}
                onChange={handleChange}
                fullWidth
                required
                error={!!errors.barcode}
                helperText={errors.barcode}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label="Image URL"
                name="image_url"
                value={product.image_url || ''}
                onChange={handleChange}
                fullWidth
              />
            </Grid>
            
            {productId && (
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={product.is_ai_enriched || false}
                      disabled
                    />
                  }
                  label="AI Enriched"
                />
              </Grid>
            )}
          </Grid>

          {/* Custom Attributes Section */}
          {attributes.length > 0 && (
            <>
              <Divider sx={{ my: 3 }} />
              <Typography variant="h6" sx={{ mb: 2 }}>
                Attributes
              </Typography>
              
              <Grid container spacing={3}>
                {attributes.map(attr => (
                  <Grid item xs={12} key={attr.id}>
                    <TextField
                      label={attr.name}
                      value={
                        attr.type === 'multiple_select'
                          ? (product.attribute_values && 
                             product.attribute_values[attr.id.toString()] 
                             ? Array.isArray(product.attribute_values[attr.id.toString()]) 
                               ? product.attribute_values[attr.id.toString()]
                               : [product.attribute_values[attr.id.toString()]]
                             : [])
                          : (product.attribute_values && 
                             product.attribute_values[attr.id.toString()] !== undefined
                             ? product.attribute_values[attr.id.toString()]
                             : '')
                      }
                      onChange={(e) => handleAttributeChange(
                        attr.id, 
                        attr.type === 'multiple_select' 
                          ? (typeof e.target.value === 'string' ? [e.target.value] : e.target.value)
                          : e.target.value
                      )}
                      fullWidth
                      required={attr.isRequired}
                      error={!!errors[`attr_${attr.id}`]}
                      helperText={errors[`attr_${attr.id}`]}
                      select={attr.type === 'single_select' || attr.type === 'multiple_select'}
                      SelectProps={{
                        native: attr.type === 'single_select',
                        multiple: attr.type === 'multiple_select'
                      }}
                    >
                      {(attr.type === 'single_select' || attr.type === 'multiple_select') && 
                       attr.options && attr.options.length > 0 && 
                       attr.options.map((option, idx) => (
                         attr.type === 'single_select' ? (
                           <option key={idx} value={option}>
                             {option}
                           </option>
                         ) : (
                           <MenuItem key={idx} value={option}>
                             {option}
                           </MenuItem>
                         )
                       ))}
                    </TextField>
                  </Grid>
                ))}
              </Grid>
            </>
          )}
          
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 4 }}>
            <Button onClick={onClose} sx={{ mr: 2 }}>
              Cancel
            </Button>
            <Button 
              variant="contained" 
              onClick={handleSave}
              disabled={saving}
              startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
            >
              {saving ? 'Saving...' : 'Save Product'}
            </Button>
          </Box>
        </Box>
      )}
    </Drawer>
  );
};

export default ProductDock; 