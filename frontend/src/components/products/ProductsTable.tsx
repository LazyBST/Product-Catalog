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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Avatar,
  Chip,
  TableSortLabel,
  Grid,
  Collapse,
  Divider,
  Tooltip,
  Menu,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import FilterListIcon from '@mui/icons-material/FilterList';
import SettingsIcon from '@mui/icons-material/Settings';
import DeleteIcon from '@mui/icons-material/Delete';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import api, { Product, ProductsFilters, ProductsSortOptions, ProductAttribute, FilterableField, SortableField } from '@/services/api';
import { debounce } from 'lodash';
import ProductDock from './ProductDock';
import { useRouter } from 'next/navigation';

interface ProductsTableProps {
  productListId: number;
  productListName: string;
}

// Read the type definition from the API import and extend it - use a type assertion instead
// interface ExtendedProductsFilters extends Omit<ProductsFilters, 'customFilters'> {
//   customFilters?: Record<string, string>;
// }

const ProductsTable = ({ productListId, productListName }: ProductsTableProps) => {
  const router = useRouter();
  
  // Function to navigate to attributes page
  const goToAttributes = () => {
    router.push(`/products/${productListId}/${encodeURIComponent(productListName)}/attributes`);
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
      
      const response = await api.getProducts(
        productListId,
        newPage,
        requestedLimit,
        searchTerm,
        apiFilters,
        sortOptions.sortField,
        sortOptions.sortOrder
      );
      
      if (response.success) {
        setProducts(response.data.products);
        setFilterableFields(response.data.filterableFields);
        setSortableFields(response.data.sortableFields);
        
        console.log({response});
        
        // Only update totalPages and totalCount from the response
        // DO NOT update the page or limit as they were already set correctly by handlePageChange or handleLimitChange
        if (reset) {
          // Only if we're resetting to page 1, update the page
          setPagination(prev => ({
            ...prev,
            page: 1,
            totalPages: response.data.pagination.totalPages,
            totalCount: response.data.pagination.totalCount
          }));
        } else {
          // Otherwise just update the totals
          setPagination(prev => ({
            ...prev,
            totalPages: response.data.pagination.totalPages,
            totalCount: response.data.pagination.totalCount
          }));
        }
        
        // Clear selection when loading new data
        setSelectedProducts([]);
        
        // Extract available brands from products
        const uniqueBrands = new Set<string>();
        response.data.products.forEach(product => {
          if (product.brand) {
            uniqueBrands.add(product.brand);
          }
        });
        setAvailableBrands(Array.from(uniqueBrands));
      } else {
        setError(response.errMsg || 'Failed to load products');
      }
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Failed to load products');
    } finally {
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
  }, [productListId, debouncedSearchTerm, JSON.stringify(filters), JSON.stringify(sortOptions)]);

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
  const handleLimitChange = (event: SelectChangeEvent<number>) => {
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
      // It's a custom filter - update the filters that will be sent
      if (`custom_${key}` in updatedFilters) {
        delete updatedFilters[`custom_${key}`];
      }
      
      // Remove from temp custom filters
      delete updatedTempCustomFilters[key];
      delete updatedSelectedFilters[key];
      
      // Update state (these are async)
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
    
    // Directly call fetchProducts with the updated filters
    fetchProducts(true, updatedFilters);
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
    setEditProductId(productId);
    setShowProductDock(true);
  };
  
  // Handle new product
  const handleNewProduct = () => {
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
        const response = await api.getAttributes(productListId);
        
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
    
    fetchProductAttributes();
  }, [productListId]);

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
  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;
    
    const { page, totalPages } = pagination;
    console.log(`renderPagination: Current page is ${page} of ${totalPages}`);
    
    // Calculate the range of pages to show
    let startPage = Math.max(1, page - 2);
    let endPage = Math.min(totalPages, page + 2);
    
    // Adjust the range if we're at the beginning or end
    if (startPage === 1) {
      endPage = Math.min(5, totalPages);
    } else if (endPage === totalPages) {
      startPage = Math.max(1, totalPages - 4);
    }
    
    const pageButtons = [];
    
    // First page button
    if (startPage > 1) {
      pageButtons.push(
        <Button
          key="first"
          variant={page === 1 ? "contained" : "outlined"}
          size="small"
          onClick={() => handlePageChange(1)}
          sx={{ minWidth: 40, mx: 0.5 }}
        >
          1
        </Button>
      );
      
      // Ellipsis if needed
      if (startPage > 2) {
        pageButtons.push(
          <Box key="ellipsis1" sx={{ mx: 1 }}>...</Box>
        );
      }
    }
    
    // Page number buttons
    for (let i = startPage; i <= endPage; i++) {
      pageButtons.push(
        <Button
          key={i}
          variant={page === i ? "contained" : "outlined"}
          color={page === i ? "primary" : "inherit"}
          size="small"
          onClick={() => handlePageChange(i)}
          sx={{ 
            minWidth: 40, 
            mx: 0.5,
            fontWeight: page === i ? 'bold' : 'normal'
          }}
        >
          {i}
        </Button>
      );
    }
    
    // Last page button
    if (endPage < totalPages) {
      // Ellipsis if needed
      if (endPage < totalPages - 1) {
        pageButtons.push(
          <Box key="ellipsis2" sx={{ mx: 1 }}>...</Box>
        );
      }
      
      pageButtons.push(
        <Button
          key="last"
          variant={page === totalPages ? "contained" : "outlined"}
          size="small"
          onClick={() => handlePageChange(totalPages)}
          sx={{ minWidth: 40, mx: 0.5 }}
        >
          {totalPages}
        </Button>
      );
    }
    
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 2, mb: 2 }}>
        <Typography variant="body2" sx={{ mr: 2 }}>
          Page {page} of {totalPages}
        </Typography>
        
        <Button
          disabled={page === 1}
          onClick={() => handlePageChange(page - 1)}
          size="small"
          sx={{ mr: 1 }}
        >
          Prev
        </Button>
        
        {pageButtons}
        
        <Button
          disabled={page === totalPages}
          onClick={() => handlePageChange(page + 1)}
          size="small"
          sx={{ ml: 1 }}
        >
          Next
        </Button>
        
        <Box sx={{ ml: 3, display: 'flex', alignItems: 'center' }}>
          <Typography variant="body2" sx={{ mr: 1 }}>Items per page:</Typography>
          <Select
            value={pagination.limit}
            onChange={handleLimitChange}
            size="small"
            sx={{ minWidth: 80 }}
          >
            <MenuItem value={20}>20</MenuItem>
            <MenuItem value={50}>50</MenuItem>
            <MenuItem value={100}>100</MenuItem>
            <MenuItem value={200}>200</MenuItem>
          </Select>
        </Box>
      </Box>
    );
  };

  const ActionButtons = () => (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Button
        variant="outlined"
        startIcon={<AutoFixHighIcon />}
        onClick={handleEnrichProducts}
        disabled={selectedProducts.length === 0 || selectedProducts.length > 5}
        size="small"
      >
        {selectedProducts.length > 5 ? 'Select Max 5 Items' : 'Enrich Selected'}
      </Button>
      <Button
        variant="outlined"
        color="error"
        startIcon={<DeleteIcon />}
        onClick={handleDeleteProducts}
        disabled={selectedProducts.length === 0 || selectedProducts.length > 5}
        size="small"
      >
        {selectedProducts.length > 5 ? 'Select Max 5 Items' : 'Delete Selected'}
      </Button>
    </Box>
  );

  // Update FilterDialog to use local state for input value
  const FilterDialog = () => {
    // Use local state for the filter input while typing
    const [localFilterValue, setLocalFilterValue] = useState('');
    
    // Initialize local state when dialog opens
    useEffect(() => {
      if (showFilterDialog && selectedFilter) {
        // First check tempCustomFilters (staged filters), then fall back to selectedFilters (active filters)
        const existingValue = selectedFilter.id ? 
          tempCustomFilters[selectedFilter.id.toString()] || 
          selectedFilters[selectedFilter.id.toString()] || 
          '' : '';
        setLocalFilterValue(existingValue);
      }
    }, [showFilterDialog, selectedFilter]);
    
    return (
      <Dialog 
        open={showFilterDialog} 
        onClose={handleCloseFilterDialog} 
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>Filter by {selectedFilter?.name}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Filter value"
            fullWidth
            value={localFilterValue}
            onChange={(e) => {
              // Only update local state while typing - no app state updates
              setLocalFilterValue(e.target.value);
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseFilterDialog} color="primary">
            Cancel
          </Button>
          <Button 
            onClick={() => {
              if (selectedFilter && localFilterValue.trim()) {
                // Only stage the filter, don't apply it immediately
                setTempCustomFilters(prev => ({
                  ...prev,
                  [selectedFilter.id.toString()]: localFilterValue
                }));
                // Close the dialog
                handleCloseFilterDialog();
              }
            }} 
            color="primary"
            disabled={!selectedFilter || !localFilterValue.trim()}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  return (
    <>
      <Paper sx={{ width: '100%', mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2 }}>
          <Typography variant="h6" fontWeight="bold">
            Products
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button 
              variant="contained" 
              color="primary" 
              onClick={handleNewProduct}
              size="small"
            >
              New Product
            </Button>
            <IconButton onClick={goToAttributes} size="small" title="Manage Attributes">
              <SettingsIcon />
            </IconButton>
            <IconButton onClick={toggleFilters} size="small" title="Toggle Filters">
              <FilterListIcon />
            </IconButton>
            <TextField
              placeholder="Search by name, brand, or barcode"
              variant="outlined"
              size="small"
              value={searchTerm}
              onChange={handleSearchChange}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
              sx={{ width: 300 }}
            />
            <IconButton onClick={handleRefresh} disabled={loading} title="Refresh">
              {loading ? <CircularProgress size={24} /> : <RefreshIcon />}
            </IconButton>
          </Box>
        </Box>

        {/* Bulk Action Buttons - Only show when products are selected */}
        {selectedProducts.length > 0 && (
          <Box sx={{ p: 2, backgroundColor: 'rgba(0, 0, 0, 0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2">
              {selectedProducts.length} products selected
            </Typography>
            <ActionButtons />
          </Box>
        )}

        {/* Horizontal filters row */}
        <Collapse in={showFilters}>
          <Box sx={{ p: 2, backgroundColor: 'rgba(0, 0, 0, 0.03)' }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={6} md={3}>
                <FormGroup>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={tempFilters.hasImage === true}
                        onChange={handleHasImageFilterChange}
                        size="small"
                      />
                    }
                    label="Has image"
                  />
                </FormGroup>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel id="brand-filter-label">Brand</InputLabel>
                  <Select
                    labelId="brand-filter-label"
                    value={tempFilters.brand || 'all'}
                    label="Brand"
                    onChange={handleBrandFilterChange}
                    size="small"
                  >
                    <MenuItem value="all">All Brands</MenuItem>
                    {availableBrands.map(brand => (
                      <MenuItem key={brand} value={brand}>{brand}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label="Created From"
                    value={tempFilters.createdFrom ? new Date(tempFilters.createdFrom * 1000) : null}
                    onChange={handleDateFromChange}
                    slotProps={{ textField: { size: 'small', fullWidth: true } }}
                  />
                </LocalizationProvider>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label="Created To"
                    value={tempFilters.createdTo ? new Date(tempFilters.createdTo * 1000) : null}
                    onChange={handleDateToChange}
                    slotProps={{ textField: { size: 'small', fullWidth: true } }}
                  />
                </LocalizationProvider>
              </Grid>
              
              {filterableFields.length > 0 && (
                <Grid item xs={12}>
                  <Typography variant="subtitle2" gutterBottom>
                    Custom Filters:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                    {filterableFields.map(field => (
                      <Button
                        key={field.id}
                        variant="outlined"
                        size="small"
                        onClick={() => handleOpenFilterDialog(field)}
                      >
                        {field.name}
                      </Button>
                    ))}
                  </Box>
                </Grid>
              )}
              
              {/* Display pending filters */}
              <Grid item xs={12}>
                {renderPendingFilters()}
              </Grid>
              
              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                  <Button 
                    variant="outlined" 
                    color="error" 
                    onClick={handleResetFilters}
                    size="small"
                  >
                    Reset
                  </Button>
                  <Button 
                    variant="contained" 
                    onClick={handleApplyFilters}
                    size="small"
                  >
                    Apply Filters
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </Box>
        </Collapse>

        {/* Display all active filters as chips */}
        {renderAllActiveFilters()}

        {error && (
          <Box sx={{ p: 2, color: 'error.main' }}>
            <Typography>{error}</Typography>
          </Box>
        )}
        <TableContainer>
          <Table>
            <TableHead sx={{ backgroundColor: 'rgba(0, 0, 0, 0.1)' }}>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectAll}
                    onChange={handleSelectAll}
                    size="small"
                    indeterminate={selectedProducts.length > 0 && selectedProducts.length < products.length}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Image</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  <TableSortLabel
                    active={sortOptions.sortField === 'name'}
                    direction={sortOptions.sortField === 'name' ? (sortOptions.sortOrder?.toLowerCase() as 'asc' | 'desc') : 'asc'}
                    onClick={() => handleSort('name', false)}
                  >
                    Product name
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  <TableSortLabel
                    active={sortOptions.sortField === 'brand'}
                    direction={sortOptions.sortField === 'brand' ? (sortOptions.sortOrder?.toLowerCase() as 'asc' | 'desc') : 'asc'}
                    onClick={() => handleSort('brand', false)}
                  >
                    Brand
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  <TableSortLabel
                    active={sortOptions.sortField === 'barcode'}
                    direction={sortOptions.sortField === 'barcode' ? (sortOptions.sortOrder?.toLowerCase() as 'asc' | 'desc') : 'asc'}
                    onClick={() => handleSort('barcode', false)}
                  >
                    Barcode
                  </TableSortLabel>
                </TableCell>
                
                {/* Render attribute column headers with sort capability for sortable ones */}
                {productAttributes.map(attr => {
                  // Check if this attribute is sortable
                  const isSortable = sortableFields.some(f => f.id === attr.id);
                  const sortFieldName = `custom_${attr.id}`;
                  
                  return (
                    <TableCell key={`header-${attr.id}`} sx={{ fontWeight: 'bold' }}>
                      {isSortable ? (
                        <TableSortLabel
                          active={sortOptions.sortField === sortFieldName}
                          direction={sortOptions.sortField === sortFieldName 
                            ? (sortOptions.sortOrder?.toLowerCase() as 'asc' | 'desc') 
                            : 'asc'}
                          onClick={() => handleSort(attr.id.toString(), true)}
                        >
                          {attr.field_name}
                        </TableSortLabel>
                      ) : (
                        attr.field_name
                      )}
                    </TableCell>
                  );
                })}
                
                <TableCell sx={{ fontWeight: 'bold' }}>
                  <TableSortLabel
                    active={sortOptions.sortField === 'created_at'}
                    direction={sortOptions.sortField === 'created_at' ? (sortOptions.sortOrder?.toLowerCase() as 'asc' | 'desc') : 'asc'}
                    onClick={() => handleSort('created_at', false)}
                  >
                    Created at
                  </TableSortLabel>
                </TableCell>
                
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>
                  <TableSortLabel
                    active={sortOptions.sortField === 'is_ai_enriched'}
                    direction={sortOptions.sortField === 'is_ai_enriched' ? (sortOptions.sortOrder?.toLowerCase() as 'asc' | 'desc') : 'asc'}
                    onClick={() => handleSort('is_ai_enriched', false)}
                  >
                    AI Enriched
                  </TableSortLabel>
                </TableCell>
                
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8 + productAttributes.length} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8 + productAttributes.length} align="center">
                    No products found
                  </TableCell>
                </TableRow>
              ) : (
                products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedProducts.includes(product.id)}
                        onChange={() => handleProductSelect(product.id)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Avatar
                        src={product.image_url || undefined}
                        alt={product.name}
                        variant="rounded"
                        sx={{ width: 60, height: 60 }}
                      >
                        {!product.image_url && product.name.charAt(0)}
                      </Avatar>
                    </TableCell>
                    <TableCell>{product.name}</TableCell>
                    <TableCell>{product.brand || 'N/A'}</TableCell>
                    <TableCell>{product.barcode}</TableCell>
                    
                    {/* Render attribute values */}
                    {productAttributes.map(attr => (
                      <TableCell key={`value-${product.id}-${attr.id}`}>
                        {product.attribute_values && 
                         product.attribute_values[attr.id.toString()] ? 
                         product.attribute_values[attr.id.toString()] : '-'}
                      </TableCell>
                    ))}
                    
                    <TableCell>{formatDate(product.created_at)}</TableCell>
                    
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Tooltip title={product.is_ai_enriched ? "AI Enriched" : "Not Enriched"}>
                          <IconButton
                            size="small"
                            onClick={() => handleEnrichProduct(product.id)}
                            disabled={loading}
                          >
                            <AutoFixHighIcon 
                              sx={{ 
                                color: product.is_ai_enriched ? 'purple' : 'green',
                                fontSize: '1.5rem'
                              }} 
                            />
                          </IconButton>
                        </Tooltip>
                        <Typography variant="body2" sx={{ ml: 1 }}>
                          {product.is_ai_enriched ? 'Yes' : 'No'}
                        </Typography>
                      </Box>
                    </TableCell>
                    
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuOpen(e, product.id)}
                      >
                        <MoreVertIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        
        {/* Custom Filter Dialog */}
        <FilterDialog />
        
        {/* Kebab Menu */}
        <Menu
          anchorEl={menuAnchorEl}
          open={Boolean(menuAnchorEl)}
          onClose={handleMenuClose}
        >
          <MenuItem 
            onClick={() => {
              if (selectedProductId) {
                handleEditProduct(selectedProductId);
                handleMenuClose();
              }
            }}
          >
            <EditIcon fontSize="small" sx={{ mr: 1 }} />
            Edit
          </MenuItem>
          <MenuItem 
            onClick={() => {
              if (selectedProductId) {
                handleDeleteProduct(selectedProductId);
                handleMenuClose();
              }
            }}
            sx={{ color: 'error.main' }}
          >
            <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
            Delete
          </MenuItem>
        </Menu>
        
        {renderPagination()}
      </Paper>
      
      {/* Product Edit/Create Dock */}
      <ProductDock
        open={showProductDock}
        onClose={() => setShowProductDock(false)}
        productListId={productListId}
        productId={editProductId}
        onSaved={handleProductSaved}
      />
    </>
  );
};

export default ProductsTable; 