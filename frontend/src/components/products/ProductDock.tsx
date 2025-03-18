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
  MenuItem,
  Select,
  Chip
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import api, { Product, Attribute } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

interface ProductDockProps {
  open: boolean;
  onClose: () => void;
  productListId: number;
  productId?: number; // Optional - if provided, we're editing an existing product
  onSaved: () => void;
}

const ProductDock: React.FC<ProductDockProps> = ({ open, onClose, productListId, productId, onSaved }) => {
  const { isLoggedIn } = useAuth();
  const [companyId, setCompanyId] = useState<number | null>(null);
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

  // Get company ID from localStorage for unauthenticated access
  useEffect(() => {
    if (!isLoggedIn) {
      const storedCompanyId = localStorage.getItem('sharedCompanyId');
      if (storedCompanyId) {
        setCompanyId(parseInt(storedCompanyId, 10));
      }
    }
  }, [isLoggedIn]);

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
      // Get companyId for API calls
      const storedCompanyId = localStorage.getItem('companyId');
      const companyId = storedCompanyId ? parseInt(storedCompanyId, 10) : undefined;
      
      // Load attributes first
      const attributesResponse = await api.getAttributes(productListId, companyId);
      
      if (!attributesResponse.success) {
        setError(attributesResponse.errMsg || 'Failed to load attributes');
        return;
      }

      // Use only custom attributes
      const customAttributes = attributesResponse.data.customAttributes || [];
      setAttributes(customAttributes);

      // If we're editing an existing product, load its data
      if (productId) {
        const productResponse = await api.getProduct(
          productListId, 
          productId,
          !isLoggedIn && companyId ? companyId : undefined
        );
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

  const handleAttributeChange = (attributeId: number | string, value: string | string[] | null) => {
    setProduct(prev => {
      // Make sure we're using a string or null value, not arrays
      const finalValue = Array.isArray(value) ? value.join(', ') : value;
      
      return {
        ...prev,
        attribute_values: {
          ...prev.attribute_values,
          [attributeId]: finalValue
        }
      };
    });
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
      
      // Pass companyId for unauthorized users
      const requestCompanyId = !isLoggedIn && companyId ? companyId : undefined;
      
      if (productId) {
        // Update existing product
        response = await api.updateProduct(productListId, productId, product, requestCompanyId);
      } else {
        // Create new product
        response = await api.createProduct(
          productListId, 
          product as Omit<Product, 'id' | 'created_at' | 'is_ai_enriched'>,
          requestCompanyId
        );
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
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 500 },
          p: 3
        },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight="bold">
          {!isLoggedIn ? 'View Product' : (productId ? 'Edit Product' : 'Create Product')}
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
      
      {!isLoggedIn && (
        <Alert severity="info" sx={{ mb: 3 }}>
          You need to be logged in to edit or create products.
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
                disabled={!isLoggedIn}
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
                             ? (Array.isArray(product.attribute_values[attr.id.toString()]) 
                                ? product.attribute_values[attr.id.toString()] as string[]
                                : [product.attribute_values[attr.id.toString()]])
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
          
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button 
              variant="contained" 
              color="primary" 
              onClick={handleSave} 
              disabled={saving || !isLoggedIn}
              startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
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