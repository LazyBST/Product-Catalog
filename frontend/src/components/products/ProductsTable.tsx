import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Box,
  Typography,
  CircularProgress,
  TextField,
  InputAdornment,
  Button,
  Checkbox,
  Avatar,
  Chip,
  TableSortLabel,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Alert,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  SelectChangeEvent,
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import FilterListIcon from '@mui/icons-material/FilterList';
import SettingsIcon from '@mui/icons-material/Settings';
import DeleteIcon from '@mui/icons-material/Delete';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import api, { Product, ProductsFilters, ProductsSortOptions, ProductAttribute, FilterableField, SortableField } from '@/services/api';
import { debounce } from 'lodash';
import ProductDock from './ProductDock';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface ProductsTableProps {
  productListId: number;
  productListName: string;
  companyId?: number | undefined;
  isCompanyIdReady?: boolean;
}

const ProductsTable = ({ productListId, productListName, companyId: propCompanyId, isCompanyIdReady }: ProductsTableProps) => {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  
  // Use company ID from props directly
  const companyId = propCompanyId;
  
  // Function to navigate to attributes page - only for authenticated users
  const goToAttributes = () => {
    if (isLoggedIn) {
      router.push(`/products/${productListId}/${encodeURIComponent(productListName)}/attributes`);
    }
  };

  // State for products data
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalPages: 0,
    totalCount: 0
  });
  
  // State for search
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  
  // State for filters
  const [tempFilters, setTempFilters] = useState<ProductsFilters>({});
  const [filters, setFilters] = useState<ProductsFilters>({});
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);
  
  // State for sorting
  const [sortOptions, setSortOptions] = useState<ProductsSortOptions>({
    sortField: 'barcode',
    sortOrder: 'ASC'
  });

  // State for showing/hiding filters
  const [showFilters, setShowFilters] = useState<boolean>(false);

  // State for product selection
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [selectAll, setSelectAll] = useState<boolean>(false);

  // State for menu
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  // State for product attributes
  const [productAttributes, setProductAttributes] = useState<ProductAttribute[]>([]);

  // State for custom filters and available filterable/sortable fields
  const [filterableFields, setFilterableFields] = useState<FilterableField[]>([]);
  const [sortableFields, setSortableFields] = useState<SortableField[]>([]);
  const [tempCustomFilters, setTempCustomFilters] = useState<Record<string, string>>({});
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterableField | null>(null);

  // Add state for product dock
  const [showProductDock, setShowProductDock] = useState(false);
  const [editProductId, setEditProductId] = useState<number | undefined>(undefined);

  // Add state for selected filters with UI representation
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({});

  // State for active custom fields
  const [activeCustomFields, setActiveCustomFields] = useState<FilterableField[]>([]);

  // Create a ref to track whether a page change is in progress
  const isPageChangeRef = React.useRef(false);

  // Create a ref to track whether a direct filter apply is in progress
  const isDirectFilterApplyRef = React.useRef(false);

  // Create a ref to store the last requested page/limit for debugging
  const lastPaginationRef = React.useRef({ page: 1, limit: 20 });

  // Handle menu open
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, productId: number) => {
    setMenuAnchorEl(event.currentTarget);
    setSelectedProductId(productId);
  };

  // Handle menu close
  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setSelectedProductId(null);
  };

  // Create a debounced function for handling search input changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((searchValue: string) => {
      setDebouncedSearchTerm(searchValue);
      setPagination(prev => ({
        ...prev,
        page: 1,
        totalPages: 0,
        totalCount: 0
      }));
    }, 500),
    []
  );

  // Handle search input changes
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    debouncedSearch(event.target.value);
  };

  // Handle product selection
  const handleProductSelect = (productId: number) => {
    setSelectedProducts(prev => {
      if (prev.includes(productId)) {
        return prev.filter(id => id !== productId);
      } else {
        return [...prev, productId];
      }
    });
  };

  // Handle select all products
  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    setSelectAll(checked);
    
    if (checked) {
      setSelectedProducts(products.map(product => product.id));
    } else {
      setSelectedProducts([]);
    }
  };

  // Enrich selected products
  const handleEnrichProducts = async () => {
    if (selectedProducts.length === 0) return;
    
    setLoading(true);
    try {
      const response = await api.enrichProducts(productListId, selectedProducts);
      
      if (response.success) {
        // Refresh products
        fetchProducts(true);
        setSelectedProducts([]);
        setSelectAll(false);
      } else {
        setError(response.errMsg || 'Failed to enrich products');
      }
    } catch (err) {
      console.error('Error enriching products:', err);
      setError('Failed to enrich products');
    } finally {
      setLoading(false);
    }
  };

  // Enrich a single product
  const handleEnrichProduct = async (productId: number) => {
    setLoading(true);
    try {
      const response = await api.enrichProducts(productListId, [productId]);
      
      if (response.success) {
        // Refresh products
        fetchProducts(true);
      } else {
        setError(response.errMsg || 'Failed to enrich product');
      }
    } catch (err) {
      console.error('Error enriching product:', err);
      setError('Failed to enrich product');
    } finally {
      setLoading(false);
    }
  };

  // Delete selected products
  const handleDeleteProducts = async () => {
    if (selectedProducts.length === 0) return;
    
    if (!window.confirm(`Are you sure you want to delete ${selectedProducts.length} products?`)) {
      return;
    }
    
    setLoading(true);
    try {
      const response = await api.deleteProducts(productListId, selectedProducts);
      
      if (response.success) {
        // Refresh products
        fetchProducts(true);
        setSelectedProducts([]);
        setSelectAll(false);
      } else {
        setError(response.errMsg || 'Failed to delete products');
      }
    } catch (err) {
      console.error('Error deleting products:', err);
      setError('Failed to delete products');
    } finally {
      setLoading(false);
    }
  };

  // Delete a single product
  const handleDeleteProduct = async (productId: number) => {
    if (!window.confirm('Are you sure you want to delete this product?')) {
      return;
    }
    
    setLoading(true);
    try {
      const response = await api.deleteProducts(productListId, [productId]);
      
      if (response.success) {
        // Refresh products
        fetchProducts(true);
      } else {
        setError(response.errMsg || 'Failed to delete product');
      }
    } catch (err) {
      console.error('Error deleting product:', err);
      setError('Failed to delete product');
    } finally {
      setLoading(false);
      handleMenuClose();
    }
  };

  // Fetch products data
  const fetchProducts = async (reset = false, overrideFilters?: ProductsFilters) => {
    setLoading(true);
    setError(null);
    
    // Only reset page to 1 if explicitly asked to
    const newPage = reset ? 1 : pagination.page;
    const requestedLimit = pagination.limit;
    
    // Update our ref with what we're requesting
    lastPaginationRef.current = { page: newPage, limit: requestedLimit };
    
    console.log(`fetchProducts: reset=${reset}, requesting page ${newPage}, limit ${requestedLimit}, state page=${pagination.page}`);
    
    try {
      // Use override filters if provided, otherwise use the state filters
      const filtersToUse = overrideFilters || filters;
      
      // Format filters properly
      const apiFilters: ProductsFilters = { ...filtersToUse };
      
      // Add each custom filter with a custom_ prefix - this is how the API expects custom filters
      // The issue is that we're adding a nested object but the API is extracting individual properties
      if (Object.keys(selectedFilters).length > 0) {
        Object.entries(selectedFilters).forEach(([key, value]) => {
          apiFilters[`custom_${key}`] = value;
        });
      }
      console.log('companyId1', companyId);
      
      // For unauthenticated users, we'll use the companyId from localStorage
      // For authenticated users, we also pass the companyId to ensure consistent behavior
      const requestCompanyId = companyId !== null ? companyId : undefined;
      
      console.log('API call with companyId:', requestCompanyId);
      
      const response = await api.getProducts(
        productListId,
        newPage,
        requestedLimit,
        searchTerm,
        apiFilters,
        sortOptions.sortField,
        sortOptions.sortOrder,
        requestCompanyId // Pass company_id for API access
      );
      
      if (response.success) {
        console.log('API getProducts success, received', response.data.products.length, 'products');
        setProducts(response.data.products);
        
        // Update pagination data
        setPagination({
          page: newPage,
          limit: requestedLimit,
          totalPages: response.data.pagination.totalPages,
          totalCount: response.data.pagination.totalCount
        });
        
        // Update available filterable and sortable fields
        setFilterableFields(response.data.filterableFields);
        setSortableFields(response.data.sortableFields);
        
        // Reset loading state
        setLoading(false);
        
        // Extract unique brands for filter
        const brands = [...new Set(response.data.products
          .map(p => p.brand)
          .filter(b => !!b)
        )];
        setAvailableBrands(brands as string[]);
      } else {
        setError(response.errMsg || 'Failed to fetch products');
        setLoading(false);
      }
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Failed to fetch products data');
      setLoading(false);
    }
  };

  // Update the useEffect to correctly reset pagination when needed
  useEffect(() => {
    // Don't fetch products if a direct filter apply is in progress
    // The handleApplyFilters function will handle that
    if (isDirectFilterApplyRef.current) {
      isDirectFilterApplyRef.current = false;
      return;
    }

    // Don't fetch if companyId is not ready yet
    if (!isCompanyIdReady || !companyId) {
      return;
    }

    // Reset pagination to page 1 when filters, search, or sort changes
    if (!isPageChangeRef.current) {
      setPagination(prev => ({
        ...prev,
        page: 1
      }));
    }
    
    // Always fetch products when dependencies change
    // The reset=true will ensure we go to page 1 for filter/search/sort changes
    fetchProducts(!isPageChangeRef.current);
    
    // Reset the page change flag
    isPageChangeRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productListId, debouncedSearchTerm, JSON.stringify(filters), JSON.stringify(sortOptions), isCompanyIdReady, companyId]);

  // Handle refresh button click
  const handleRefresh = () => {
    fetchProducts(true);
  };

  // Function to handle page change
  const handlePageChange = (newPage: number) => {
    // Set flag to indicate page change is in progress
    isPageChangeRef.current = true;
    
    console.log(`handlePageChange: changing to page ${newPage}`);
    
    // Update the pagination state
    setPagination(prev => ({
      ...prev,
      page: newPage
    }));
    
    // Override the lastPaginationRef before calling fetchProducts
    lastPaginationRef.current = {
      ...lastPaginationRef.current,
      page: newPage
    };
    
    // Call fetchProducts with the current page and filters
    fetchProducts(false, filters);
  };

  // Function to handle items per page change
  const handleLimitChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Set flag to indicate pagination change is in progress
    isPageChangeRef.current = true;
    
    const newLimit = Number(event.target.value);
    console.log(`handleLimitChange: changing to limit ${newLimit}`);
    
    // Update pagination state
    setPagination(prev => ({
      ...prev,
      limit: newLimit,
      page: 1 // Reset to first page when changing limit
    }));
    
    // Override the lastPaginationRef before fetching
    lastPaginationRef.current = {
      page: 1,
      limit: newLimit
    };
    
    // Call fetchProducts with the current filters
    fetchProducts(true, filters);
  };

  // Initialize temp filters with current filters
  useEffect(() => {
    setTempFilters(filters);
  }, [filters]);

  // Handle filter changes
  const handleBrandFilterChange = (event: SelectChangeEvent<string>) => {
    const brand = event.target.value;
    setTempFilters(prev => ({ 
      ...prev, 
      brand: brand === 'all' ? null : brand 
    }));
  };

  const handleHasImageFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTempFilters(prev => ({ 
      ...prev, 
      hasImage: event.target.checked ? true : null 
    }));
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDateFromChange = (date: Date | null) => {
    if (date) {
      const timestamp = Math.floor(date.getTime() / 1000);
      setTempFilters(prev => ({ ...prev, createdFrom: timestamp }));
    } else {
      setTempFilters(prev => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { createdFrom, ...rest } = prev;
        return rest;
      });
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDateToChange = (date: Date | null) => {
    if (date) {
      const timestamp = Math.floor(date.getTime() / 1000);
      setTempFilters(prev => ({ ...prev, createdTo: timestamp }));
    } else {
      setTempFilters(prev => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { createdTo, ...rest } = prev;
        return rest;
      });
    }
  };

  // Reset all filters
  const handleResetFilters = () => {
    // Set the direct filter apply flag to prevent double API calls
    isDirectFilterApplyRef.current = true;

    // Create empty filters objects
    const emptyFilters: ProductsFilters = {};
    
    // Update all state (these are async)
    setTempFilters(emptyFilters);
    setTempCustomFilters({});
    setFilters(emptyFilters);
    setSelectedFilters({});
    setActiveCustomFields([]);
    
    // Reset pagination when clearing filters
    setPagination(prev => ({
      ...prev,
      page: 1
    }));
    
    // Make an API call to fetch products without filters - pass empty filters directly
    fetchProducts(true, emptyFilters);
  };

  // Apply filters
  const handleApplyFilters = () => {
    // Set the direct filter apply flag to prevent double API calls
    isDirectFilterApplyRef.current = true;

    // Create the combined filters object
    const combinedFilters = { ...tempFilters };
    
    // Add custom filters directly as properties with custom_ prefix
    Object.entries(tempCustomFilters).forEach(([key, value]) => {
      combinedFilters[`custom_${key}`] = value;
    });
    
    // Update state (this happens asynchronously)
    setFilters(combinedFilters);
    setSelectedFilters(tempCustomFilters);
    
    // Also update active custom fields for UI representation
    const newActiveCustomFields: FilterableField[] = [];
    
    // Add all fields from tempCustomFilters to activeCustomFields
    Object.keys(tempCustomFilters).forEach(fieldId => {
      const field = filterableFields.find(f => f.id.toString() === fieldId);
      if (field && !newActiveCustomFields.some(f => f.id === field.id)) {
        newActiveCustomFields.push(field);
      }
    });
    
    setActiveCustomFields(newActiveCustomFields);
    
    // Reset pagination when applying filters
    setPagination(prev => ({
      ...prev,
      page: 1
    }));
    
    // Now fetch products with the combined filters - pass them directly to avoid state timing issues
    fetchProducts(true, combinedFilters);
    
    setShowFilterDialog(false);
  };

  // Update handleOpenFilterDialog to not set the initial input value (now handled in the dialog)
  const handleOpenFilterDialog = (field: FilterableField) => {
    setSelectedFilter(field);
    setShowFilterDialog(true);
  };

  // Close filter dialog
  const handleCloseFilterDialog = () => {
    setShowFilterDialog(false);
    setSelectedFilter(null);
  };

  // Remove a specific filter
  const removeFilter = (key: string) => {
    // Set the direct filter apply flag to prevent double API calls
    isDirectFilterApplyRef.current = true;

    // Create a copy of the current filters to modify
    const updatedFilters = { ...filters };
    const updatedTempFilters = { ...tempFilters };
    const updatedSelectedFilters = { ...selectedFilters };
    const updatedTempCustomFilters = { ...tempCustomFilters };

    // Check if it's a standard filter
    if (key in filters) {
      // Remove from both filters and tempFilters
      delete updatedFilters[key as keyof ProductsFilters];
      delete updatedTempFilters[key as keyof ProductsFilters];
      
      // Update state (these are async)
      setFilters(updatedFilters);
      setTempFilters(updatedTempFilters);
    } else {
      // It's a custom filter - completely remove it from all filter objects
      // Remove from filters object with the custom_ prefix
      delete updatedFilters[`custom_${key}`];
      
      // Remove from temp custom filters
      delete updatedTempCustomFilters[key];
      delete updatedSelectedFilters[key];
      
      // Update state (these are async)
      setFilters(updatedFilters);  // Also update the main filters object
      setTempCustomFilters(updatedTempCustomFilters);
      setSelectedFilters(updatedSelectedFilters);
      
      // Remove from active custom fields
      const fieldToRemove = activeCustomFields.find(f => f.id.toString() === key);
      if (fieldToRemove) {
        setActiveCustomFields(prev => prev.filter(f => f.id.toString() !== key));
      }
    }
    
    // Reset pagination when removing a filter
    setPagination(prev => ({
      ...prev,
      page: 1
    }));
    
    // Create a sanitized version of updatedFilters for the API call
    // that doesn't contain any references to the removed custom filter
    const apiFilters = { ...updatedFilters };
    
    // Directly call fetchProducts with the updated filters
    fetchProducts(true, apiFilters);
  };

  // Function to remove a custom filter
  const removeCustomFilter = (fieldId: string) => {
    // This function is now only called via removeFilter which already sets the flag
    // isDirectFilterApplyRef.current = true;

    // Find the field in activeCustomFields
    const field = activeCustomFields.find(f => f.id.toString() === fieldId);
    
    if (!field) return;
    
    // Simply call removeFilter which now handles everything
    removeFilter(fieldId);
  };

  // Update the handleSort function to use direct ID for custom fields without the unused parameter
  const handleSort = (field: string, isCustomField = false) => {
    setSortOptions(prev => {
      // Use the field directly, but add custom_ prefix for custom fields
      const newSortField = isCustomField ? `custom_${field}` : field;
      
      // If we're already sorting by this field, toggle the direction
      if (prev.sortField === newSortField) {
        return {
          sortField: newSortField,
          sortOrder: prev.sortOrder === 'ASC' ? 'DESC' : 'ASC'
        };
      } else {
        // Otherwise, sort by the new field in ascending order by default
        return {
          sortField: newSortField,
          sortOrder: 'ASC'
        };
      }
    });
  };

  // Format timestamp to readable date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  // Toggle filters visibility
  const toggleFilters = () => {
    setShowFilters(!showFilters);
  };

  // Handle edit product
  const handleEditProduct = (productId: number) => {
    // For unauthorized users, they can only view products, not edit them
    setEditProductId(productId);
    setShowProductDock(true);
  };
  
  // Handle new product
  const handleNewProduct = () => {
    // Don't allow unauthorized users to create new products
    if (!isLoggedIn) {
      return;
    }
    setEditProductId(undefined);
    setShowProductDock(true);
  };
  
  // Handle product saved
  const handleProductSaved = () => {
    fetchProducts(true);
  };

  // Fetch product attributes
  useEffect(() => {
    const fetchProductAttributes = async () => {
      try {
        // Pass companyId to getAttributes if available
        const response = await api.getAttributes(productListId, companyId);
        
        if (response.success) {
          // Transform attributes to match ProductAttribute interface
          const allAttributes = [...response.data.customAttributes]
            .map(attr => ({
              id: typeof attr.id === 'string' ? parseInt(attr.id, 10) : attr.id,
              field_name: attr.name,
              group_name: attr.group,
              type: attr.type,
              is_ai_editable: attr.isAiEnriched,
              is_sortable: attr.isSortable,
              is_filterable: attr.isFilterable
            }));
          
          setProductAttributes(allAttributes);
          
          // Transform for filterable and sortable fields
          const filterableAttrs = allAttributes
            .filter(attr => attr.is_filterable)
            .map(attr => ({
              id: attr.id,
              name: attr.field_name,
              type: attr.type
            }));
          
          const sortableAttrs = allAttributes
            .filter(attr => attr.is_sortable)
            .map(attr => ({
              id: attr.id,
              name: attr.field_name
            }));
          
          setFilterableFields(filterableAttrs);
          setSortableFields(sortableAttrs);
        } else {
          setError(response.errMsg || 'Failed to fetch attributes');
        }
      } catch (err) {
        console.error('Error fetching attributes:', err);
        setError('Failed to fetch attributes');
      }
    };
    
    // Only fetch when companyId is ready
    if (isCompanyIdReady && companyId) {
      fetchProductAttributes();
    }
  }, [productListId, companyId, isCompanyIdReady]);

  // Initial data fetch to send companyId on first mount
  useEffect(() => {
    // Only trigger when companyId is ready
    if (isCompanyIdReady && companyId) {
      console.log('Initial fetch with companyId:', companyId);
      fetchProducts(true);
    }
  }, [companyId, isCompanyIdReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render all active filters as chips
  const renderAllActiveFilters = () => {
    const hasActiveFilters = Object.keys(filters).length > 0 || activeCustomFields.length > 0;
    
    if (!hasActiveFilters) {
      return null;
    }
    
    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2, mb: 2 }}>
        {/* Standard filters */}
        {filters.hasImage && (
          <Chip 
            label="Has Image" 
            size="small"
            color="primary"
            onDelete={() => removeFilter('hasImage')}
          />
        )}
        {filters.brand && (
          <Chip 
            label={`Brand: ${filters.brand}`} 
            size="small"
            color="primary"
            onDelete={() => removeFilter('brand')}
          />
        )}
        {filters.createdFrom && (
          <Chip 
            label={`From: ${formatDate(filters.createdFrom)}`} 
            size="small"
            color="primary"
            onDelete={() => removeFilter('createdFrom')}
          />
        )}
        {filters.createdTo && (
          <Chip 
            label={`To: ${formatDate(filters.createdTo)}`} 
            size="small"
            color="primary"
            onDelete={() => removeFilter('createdTo')}
          />
        )}
        
        {/* Custom filters */}
        {activeCustomFields.map(field => (
          <Chip
            key={field.id}
            label={`${field.name}: ${selectedFilters[field.id.toString()]}`}
            onDelete={() => removeCustomFilter(field.id.toString())}
            color="primary"
            size="small"
          />
        ))}
      </Box>
    );
  };

  // Render pending filters as grayed out chips
  const renderPendingFilters = () => {
    const hasPendingFilters = 
      (tempFilters.hasImage !== filters.hasImage) || 
      (tempFilters.brand !== filters.brand) || 
      (tempFilters.createdFrom !== filters.createdFrom) || 
      (tempFilters.createdTo !== filters.createdTo) ||
      Object.keys(tempCustomFilters).some(key => tempCustomFilters[key] !== selectedFilters[key]);
    
    if (!hasPendingFilters) {
      return null;
    }
    
    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1, mb: 1 }}>
        <Typography variant="body2" sx={{ mr: 1, fontStyle: 'italic', color: 'text.secondary' }}>
          Pending filters (click Apply to use):
        </Typography>
        
        {/* Pending standard filters */}
        {tempFilters.hasImage !== filters.hasImage && tempFilters.hasImage && (
          <Chip 
            label="Has Image" 
            size="small"
            variant="outlined"
            sx={{ color: 'text.secondary' }}
          />
        )}
        {tempFilters.brand !== filters.brand && tempFilters.brand && (
          <Chip 
            label={`Brand: ${tempFilters.brand}`} 
            size="small"
            variant="outlined"
            sx={{ color: 'text.secondary' }}
          />
        )}
        {tempFilters.createdFrom !== filters.createdFrom && tempFilters.createdFrom && (
          <Chip 
            label={`From: ${formatDate(tempFilters.createdFrom)}`} 
            size="small"
            variant="outlined"
            sx={{ color: 'text.secondary' }}
          />
        )}
        {tempFilters.createdTo !== filters.createdTo && tempFilters.createdTo && (
          <Chip 
            label={`To: ${formatDate(tempFilters.createdTo)}`} 
            size="small"
            variant="outlined"
            sx={{ color: 'text.secondary' }}
          />
        )}
        
        {/* Pending custom filters that are different from applied ones */}
        {Object.entries(tempCustomFilters).map(([fieldId, value]) => {
          // Skip if this filter is already applied with the same value
          if (selectedFilters[fieldId] === value) {
            return null;
          }
          
          const field = filterableFields.find(f => f.id.toString() === fieldId);
          if (!field) return null;
          
          return (
            <Chip
              key={`pending-${fieldId}`}
              label={`${field.name}: ${value}`}
              size="small"
              variant="outlined"
              sx={{ color: 'text.secondary' }}
            />
          );
        })}
      </Box>
    );
  };

  // Render pagination controls
  const renderPagination = () => (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', py: 2 }}>
      {/* Pagination controls */}
      {pagination.totalPages > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Button
            disabled={pagination.page === 1}
            onClick={() => handlePageChange(pagination.page - 1)}
          >
            Previous
          </Button>
          <Typography sx={{ mx: 2 }}>
            Page {pagination.page} of {pagination.totalPages}
          </Typography>
          <Button
            disabled={pagination.page === pagination.totalPages}
            onClick={() => handlePageChange(pagination.page + 1)}
          >
            Next
          </Button>
        </Box>
      )}
    </Box>
  );

  // Extract ActionButtons as a separate component
  const ActionButtons = () => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button 
          variant="outlined" 
          onClick={handleRefresh} 
          startIcon={<RefreshIcon />}
        >
          Refresh
        </Button>
        <Button 
          variant="outlined" 
          onClick={toggleFilters} 
          startIcon={<FilterListIcon />}
        >
          {showFilters ? 'Hide Filters' : 'Show Filters'}
        </Button>
        
        {isLoggedIn && (
          <Button 
            variant="outlined" 
            onClick={goToAttributes} 
            startIcon={<SettingsIcon />}
          >
            Attributes
          </Button>
        )}
      </Box>
      
      {/* Only show Add Product button for authorized users */}
      {isLoggedIn && (
        <Button 
          variant="contained" 
          onClick={handleNewProduct}
        >
          Add Product
        </Button>
      )}
    </Box>
  );

  return (
    <Box>
      <ActionButtons />
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      {/* Search, filters, etc. remain the same */}
      <Box sx={{ width: '100%', mb: 2 }}>
        <TextField
          placeholder="Search products..."
          variant="outlined"
          fullWidth
          value={searchTerm}
          onChange={handleSearchChange}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Box>
      
      {/* Only show filters when showFilters is true */}
      {showFilters && (
        <Box sx={{ mb: 2 }}>
          {/* Display active filters first */}
          {renderAllActiveFilters()}
          
          {/* Then display any pending filters */}
          {renderPendingFilters()}
          
          {/* Add the actual filter controls */}
          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="h6" gutterBottom>Filters</Typography>
            
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {/* Has Image filter */}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={!!tempFilters.hasImage}
                    onChange={handleHasImageFilterChange}
                  />
                }
                label="Has Image"
              />
              
              {/* Brand filter */}
              {availableBrands.length > 0 && (
                <FormControl sx={{ minWidth: 200 }}>
                  <InputLabel>Brand</InputLabel>
                  <Select
                    value={tempFilters.brand || 'all'}
                    onChange={handleBrandFilterChange}
                    label="Brand"
                  >
                    <MenuItem value="all">All Brands</MenuItem>
                    {availableBrands.map(brand => (
                      <MenuItem key={brand} value={brand}>{brand}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              
              {/* Date range filters */}
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <DatePicker
                    label="Created From"
                    value={tempFilters.createdFrom ? new Date(tempFilters.createdFrom * 1000) : null}
                    onChange={(date) => handleDateFromChange(date)}
                    slotProps={{ textField: { variant: 'outlined', size: 'small' } }}
                  />
                  <DatePicker
                    label="Created To"
                    value={tempFilters.createdTo ? new Date(tempFilters.createdTo * 1000) : null}
                    onChange={(date) => handleDateToChange(date)}
                    slotProps={{ textField: { variant: 'outlined', size: 'small' } }}
                  />
                </Box>
              </LocalizationProvider>
              
              {/* Display custom field filters on a new line */}
              </Box>
              
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Custom Filters:</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {/* Custom field filters */}
              {filterableFields.map(field => (
                <Button 
                  key={field.id}
                  variant="outlined"
                  size="small"
                  onClick={() => handleOpenFilterDialog(field)}
                  startIcon={<FilterListIcon />}
                >
                  Filter by {field.name}
                </Button>
              ))}
            </Box>
            
            {/* Filter action buttons */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
              <Button 
                sx={{ mr: 1 }}
                onClick={handleResetFilters}
              >
                Reset Filters
              </Button>
              <Button 
                variant="contained" 
                color="primary"
                onClick={handleApplyFilters}
              >
                Apply Filters
              </Button>
            </Box>
          </Paper>
        </Box>
      )}
      
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              {/* Only show checkbox column for authenticated users */}
              {isLoggedIn && (
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={selectedProducts.length > 0 && selectedProducts.length < products.length}
                    checked={selectAll}
                    onChange={handleSelectAll}
                  />
                </TableCell>
              )}
              <TableCell>
                <TableSortLabel
                  active={sortOptions.sortField === 'barcode'}
                  direction={sortOptions.sortField === 'barcode' ? sortOptions.sortOrder?.toLowerCase() as 'asc' | 'desc' : 'asc'}
                  onClick={() => handleSort('barcode')}
                >
                  Barcode
                </TableSortLabel>
              </TableCell>
              <TableCell>Image</TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortOptions.sortField === 'name'}
                  direction={sortOptions.sortField === 'name' ? sortOptions.sortOrder?.toLowerCase() as 'asc' | 'desc' : 'asc'}
                  onClick={() => handleSort('name')}
                >
                  Name
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortOptions.sortField === 'brand'}
                  direction={sortOptions.sortField === 'brand' ? sortOptions.sortOrder?.toLowerCase() as 'asc' | 'desc' : 'asc'}
                  onClick={() => handleSort('brand')}
                >
                  Brand
                </TableSortLabel>
              </TableCell>
              
              {/* Render custom attribute columns - show all attributes */}
              {productAttributes.map(attr => (
                <TableCell key={attr.id}>
                  <TableSortLabel
                    active={sortOptions.sortField === `custom_${attr.id}`}
                    direction={sortOptions.sortField === `custom_${attr.id}` ? sortOptions.sortOrder?.toLowerCase() as 'asc' | 'desc' : 'asc'}
                    onClick={() => handleSort(`custom_${attr.id}`, true)}
                    disabled={!attr.is_sortable}
                  >
                    {attr.field_name}
                  </TableSortLabel>
                </TableCell>
              ))}
              
              {/* Only show AI enriched column for authenticated users */}
              {isLoggedIn && (
                <TableCell>
                  <TableSortLabel
                    active={sortOptions.sortField === 'is_ai_enriched'}
                    direction={sortOptions.sortField === 'is_ai_enriched' ? sortOptions.sortOrder?.toLowerCase() as 'asc' | 'desc' : 'asc'}
                    onClick={() => handleSort('is_ai_enriched')}
                  >
                    AI Enriched
                  </TableSortLabel>
                </TableCell>
              )}
              
              {/* Only show actions column for authenticated users */}
              {isLoggedIn && <TableCell>Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell 
                  colSpan={
                    3 + // barcode, name, brand
                    1 + // image
                    productAttributes.length +
                    (isLoggedIn ? 3 : 0) // checkbox, AI enriched, actions (only for authenticated)
                  } 
                  align="center"
                >
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell 
                  colSpan={
                    3 + // barcode, name, brand
                    1 + // image
                    productAttributes.length +
                    (isLoggedIn ? 3 : 0) // checkbox, AI enriched, actions (only for authenticated)
                  }
                  align="center"
                >
                  No products found
                </TableCell>
              </TableRow>
            ) : (
              products.map(product => (
                <TableRow
                  key={product.id}
                  hover
                  selected={selectedProducts.includes(product.id)}
                >
                  {/* Only show checkbox for authenticated users */}
                  {isLoggedIn && (
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedProducts.includes(product.id)}
                        onChange={() => handleProductSelect(product.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell>{product.barcode}</TableCell>
                  <TableCell>
                    {product.image_url ? (
                      <Avatar src={product.image_url} alt={product.name} sx={{ width: 40, height: 40 }} />
                    ) : (
                      <Avatar sx={{ width: 40, height: 40, bgcolor: 'grey.300' }}>No</Avatar>
                    )}
                  </TableCell>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{product.brand}</TableCell>
                  
                  {/* Render custom attribute values */}
                  {productAttributes.map(attr => (
                    <TableCell key={attr.id}>
                      {product.attribute_values?.[attr.id] || '-'}
                    </TableCell>
                  ))}
                  
                  {/* Only show AI enriched column for authenticated users */}
                  {isLoggedIn && (
                    <TableCell>
                      {product.is_ai_enriched ? (
                        <Chip label="Yes" size="small" color="success" />
                      ) : (
                        <Chip label="No" size="small" color="default" />
                      )}
                    </TableCell>
                  )}
                  
                  {/* Only show actions column for authenticated users */}
                  {isLoggedIn && (
                    <TableCell>
                      <IconButton
                        aria-label="more"
                        onClick={(e) => handleMenuOpen(e, product.id)}
                        size="small"
                      >
                        <MoreVertIcon />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      
      {/* Render pagination */}
      {renderPagination()}
      
      {/* Context menu for actions - only shown for authenticated users */}
      {isLoggedIn && (
        <Menu
          anchorEl={menuAnchorEl}
          open={Boolean(menuAnchorEl)}
          onClose={handleMenuClose}
        >
          <MenuItem onClick={() => {
            if (selectedProductId) {
              handleEditProduct(selectedProductId);
            }
            handleMenuClose();
          }}>
            <EditIcon fontSize="small" sx={{ mr: 1 }} />
            Edit
          </MenuItem>
          <MenuItem onClick={() => {
            if (selectedProductId) {
              handleEnrichProduct(selectedProductId);
            }
            handleMenuClose();
          }}>
            <AutoFixHighIcon fontSize="small" sx={{ mr: 1 }} />
            Enrich
          </MenuItem>
          <MenuItem onClick={() => {
            if (selectedProductId) {
              handleDeleteProduct(selectedProductId);
            }
          }}>
            <DeleteIcon fontSize="small" sx={{ mr: 1 }} color="error" />
            Delete
          </MenuItem>
        </Menu>
      )}
      
      {/* Product dock for editing - only shown for authenticated users */}
      {isLoggedIn && (
        <ProductDock
          open={showProductDock}
          onClose={() => {
            setShowProductDock(false);
            setEditProductId(undefined);
          }}
          productListId={productListId}
          productId={editProductId}
          onSaved={handleProductSaved}
        />
      )}
      
      {/* Filter dialog - only if both conditions are true */}
      {showFilterDialog && selectedFilter && (
        <Dialog
          open={showFilterDialog}
          onClose={handleCloseFilterDialog}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>
            Filter by {selectedFilter?.name}
            <IconButton
              onClick={handleCloseFilterDialog}
              sx={{ position: 'absolute', right: 8, top: 8 }}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label={`Enter ${selectedFilter?.name} value`}
              fullWidth
              variant="outlined"
              value={tempCustomFilters[selectedFilter?.id.toString()] || ''}
              onChange={(e) => setTempCustomFilters({
                ...tempCustomFilters,
                [selectedFilter?.id.toString()]: e.target.value
              })}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseFilterDialog} color="primary">
              Cancel
            </Button>
            <Button 
              onClick={() => {
                // Add this custom filter to the list
                if (selectedFilter && tempCustomFilters[selectedFilter.id.toString()]) {
                  setSelectedFilters({
                    ...selectedFilters,
                    [selectedFilter.id.toString()]: tempCustomFilters[selectedFilter.id.toString()]
                  });
                  
                  // Reset dialog
                  handleCloseFilterDialog();
                }
              }} 
              color="primary"
            >
              Apply
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};

export default ProductsTable; 