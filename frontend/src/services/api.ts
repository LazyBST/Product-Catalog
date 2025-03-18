import axios from 'axios';
import config from '@/config';

// Authentication interfaces
export interface LoginRequest {
  username: string;
  password: string;
}

export interface SignupRequest {
  fullName: string;
  username: string;
  password: string;
  company: string;
}

export interface User {
  id: number;
  name: string;
  companyId: number;
  company_name: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  errMsg: string | null;
}

export interface ProductList {
  id: number;
  listName: string;
  created_at: number;
}

export interface ProductPipeline {
  id: number;
  listName: string;
  total_batches: number | null;
  processed_batches: number | null;
  last_processed_at: number | null;
  created_at: number;
}

export interface CreateProductListRequest {
  listName: string;
}

export interface Product {
  id: number;
  name: string;
  image_url: string | null;
  brand: string | null;
  barcode: string;
  has_image: boolean;
  created_at: number;
  is_ai_enriched: boolean;
  attribute_values: Record<string, string | null>;
}

export interface ProductsFilters {
  hasImage?: boolean | null;
  brand?: string | null;
  createdFrom?: number | null;
  createdTo?: number | null;
  [key: string]: boolean | string | number | null | undefined; // Specify possible value types
}

export interface ProductsSortOptions {
  sortField?: string; // Changed from specific fields to any string to support custom fields
  sortOrder?: 'ASC' | 'DESC';
}

export interface FilterableField {
  id: number;
  name: string;
  type: string;
}

export interface SortableField {
  id: number;
  name: string;
}

export interface ProductsResponse {
  products: Product[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  filterableFields: FilterableField[];
  sortableFields: SortableField[];
}

// Attribute interfaces
export interface Attribute {
  id: number | string;
  name: string;
  group: string;
  options: string[];
  prompt: string;
  isAiEnriched: boolean;
  isSortable: boolean;
  isFilterable: boolean;
  isRequired: boolean;
  isMultiValue: boolean;
  isSystem: boolean;
  type: 'text' | 'number' | 'single_select' | 'multiple_select' | 'date' | 'boolean';
}

export interface AttributesResponse {
  systemAttributes: Attribute[];
  customAttributes: Attribute[];
}

export interface AttributeCreateRequest {
  name: string;
  group: string;
  type: 'text' | 'number' | 'single_select' | 'multiple_select';
  options?: string[];
  prompt?: string;
  isAiEnriched?: boolean;
  isSortable?: boolean;
  isFilterable?: boolean;
}

export interface AttributeUpdateRequest extends Partial<AttributeCreateRequest> {
  isDeleted?: boolean;
}

export interface ProductAttribute {
  id: number;
  field_name: string;
  group_name: string;
  type: string;
  is_ai_editable: boolean;
  is_sortable: boolean;
  is_filterable: boolean;
}

// Setup axios instance with base URL
const api = axios.create({
  baseURL: config.apiUrl,
});

// Add a request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Authentication methods
const login = async (data: LoginRequest): Promise<ApiResponse<AuthResponse>> => {
  try {
    const response = await api.post<ApiResponse<AuthResponse>>('/auth/login', data);
    
    // Store token in localStorage
    if (response.data.success && response.data.data.token) {
      localStorage.setItem('token', response.data.data.token);
    }
    
    return response.data;
  } catch (error: unknown) {
    const err = error as { response?: { data: ApiResponse<AuthResponse> }, message?: string };
    if (err.response && err.response.data) {
      return err.response.data;
    }
    return {
      success: false,
      data: null as unknown as AuthResponse,
      errMsg: err.message || 'Login failed'
    };
  }
};

const signup = async (data: SignupRequest): Promise<ApiResponse<AuthResponse>> => {
  try {
    const response = await api.post<ApiResponse<AuthResponse>>('/auth/signup', data);
    
    // Store token in localStorage
    if (response.data.success && response.data.data.token) {
      localStorage.setItem('token', response.data.data.token);
    }
    
    return response.data;
  } catch (error: unknown) {
    const err = error as { response?: { data: ApiResponse<AuthResponse> }, message?: string };
    if (err.response && err.response.data) {
      return err.response.data;
    }
    return {
      success: false,
      data: null as unknown as AuthResponse,
      errMsg: err.message || 'Signup failed'
    };
  }
};

const logout = () => {
  // Clear all auth-related items from localStorage
  localStorage.removeItem('token');
  localStorage.removeItem('userName');
  localStorage.removeItem('companyName');
  
  // Clear any authorization headers
  delete api.defaults.headers.common['Authorization'];
};

const apiMethods = {
  /**
   * Get all product lists
   */
  getProductLists: async () => {
    const response = await api.get<ApiResponse<ProductList[]>>(`${config.apiBaseUrl}${config.endpoints.productList}`);
    return response.data;
  },

  /**
   * Create a new product list
   */
  createProductList: async (data: CreateProductListRequest) => {
    const response = await api.post<ApiResponse<ProductList>>(
      `${config.apiBaseUrl}${config.endpoints.productList}`,
      data
    );
    return response.data;
  },

  /**
   * Get product list pipeline data
   */
  getProductListPipeline: async () => {
    const response = await api.get<ApiResponse<ProductPipeline[]>>(`${config.apiBaseUrl}${config.endpoints.productListPipeline}`);
    return response.data;
  },

  /**
   * Get products by product list ID
   */
  getProducts: async (
    productListId: number,
    page: number = 1,
    limit: number = 20,
    searchTerm: string = '',
    filters: ProductsFilters = {},
    sortField: string = 'created_at',
    sortOrder: 'ASC' | 'DESC' = 'ASC'
  ) => {
    console.log(`API getProducts: requesting page=${page}, limit=${limit}, sortField=${sortField}`);
    
    const { hasImage, brand, createdFrom, createdTo, ...customFilters } = filters;

    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    
    if (searchTerm) params.append('name', searchTerm);
    if (hasImage !== undefined && hasImage !== null) params.append('hasImage', hasImage.toString());
    if (brand) params.append('brand', brand);
    if (createdFrom) params.append('createdFrom', createdFrom.toString());
    if (createdTo) params.append('createdTo', createdTo.toString());
    
    // Add sort parameters, handling both regular and custom field sorting
    if (sortField) params.append('sortField', sortField);
    if (sortOrder) params.append('sortOrder', sortOrder);
    
    // Add custom filters
    Object.entries(customFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });

    const productsUrl = config.endpoints.productsBase.replace('{productListId}', productListId.toString());
    const response = await api.get<ApiResponse<ProductsResponse>>(
      `${config.apiBaseUrl}${productsUrl}?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Upload a file (placeholder, not implemented in backend yet)
   */
  uploadFile: async (file: File, listName: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('listName', listName);
    
    // This would be implemented once the backend endpoint is available
    // const response = await axios.post<ApiResponse<{ message: string }>>(`${config.apiBaseUrl}/upload`, formData);
    // return response.data;
    
    // For now, just simulate a successful response
    await new Promise(resolve => setTimeout(resolve, 2000));
    return {
      success: true,
      data: { message: 'File uploaded successfully' },
      errMsg: null
    } as ApiResponse<{ message: string }>;
  },

  /**
   * Get attributes for a product list
   */
  getAttributes: async (productListId: number) => {
    const response = await api.get<ApiResponse<AttributesResponse>>(
      `${config.apiBaseUrl}/product-list/${productListId}/attributes`
    );
    return response.data;
  },

  /**
   * Create a new attribute
   */
  createAttribute: async (productListId: number, data: AttributeCreateRequest) => {
    const response = await api.post<ApiResponse<Attribute>>(
      `${config.apiBaseUrl}/product-list/${productListId}/attributes`,
      data
    );
    return response.data;
  },

  /**
   * Update an attribute
   */
  updateAttribute: async (productListId: number, attributeId: number, data: AttributeUpdateRequest) => {
    const response = await api.put<ApiResponse<Attribute>>(
      `${config.apiBaseUrl}/product-list/${productListId}/attributes/${attributeId}`,
      data
    );
    return response.data;
  },

  /**
   * Delete an attribute (soft delete)
   */
  deleteAttribute: async (productListId: number, attributeId: number) => {
    const response = await api.put<ApiResponse<Attribute>>(
      `${config.apiBaseUrl}/product-list/${productListId}/attributes/${attributeId}`,
      { isDeleted: true }
    );
    return response.data;
  },

  /**
   * Toggle attribute field
   */
  toggleAttributeField: async (
    productListId: number, 
    attributeId: number, 
    field: 'isAiEnriched' | 'isSortable' | 'isFilterable', 
    value: boolean
  ) => {
    const data: AttributeUpdateRequest = { [field]: value };
    const response = await api.put<ApiResponse<Attribute>>(
      `${config.apiBaseUrl}/product-list/${productListId}/attributes/${attributeId}`,
      data
    );
    return response.data;
  },

  /**
   * Get AI-suggested attributes based on product list data
   */
  suggestAttributes: async (productListId: number) => {
    const response = await api.post<ApiResponse<Attribute[]>>(
      `${config.apiBaseUrl}/product-list/${productListId}/attributes/suggest`
    );
    return response.data;
  },

  /**
   * Enrich products with AI
   * @param productListId - The ID of the product list
   * @param productIds - Array of product IDs to enrich
   */
  enrichProducts: async (productListId: number, productIds: number[]) => {
    const productsUrl = config.endpoints.productsBase.replace('{productListId}', productListId.toString());
    const response = await api.put<ApiResponse<{ message: string }>>(
      `${config.apiBaseUrl}${productsUrl}/global/enrich`,
      {
        productListId,
        productIds
      }
    );
    return response.data;
  },

  /**
   * Delete products (soft delete)
   * @param productListId - The ID of the product list
   * @param productIds - Array of product IDs to delete
   */
  deleteProducts: async (productListId: number, productIds: number[]) => {
    const productsUrl = config.endpoints.productsBase.replace('{productListId}', productListId.toString());
    const response = await api.put<ApiResponse<{ message: string }>>(
      `${config.apiBaseUrl}${productsUrl}/global/delete`,
      {
        productListId,
        productIds
      }
    );
    return response.data;
  },

  /**
   * Get product list attributes
   */
  getProductListAttributes: async (productListId: number) => {
    const attributesUrl = config.endpoints.attributes.replace('{productListId}', productListId.toString());
    const response = await api.get<ApiResponse<ProductAttribute[]>>(
      `${config.apiBaseUrl}${attributesUrl}`
    );
    return response.data;
  },

  /**
   * Get a single product by ID
   */
  getProduct: async (productListId: number, productId: number) => {
    const productsUrl = config.endpoints.productsBase.replace('{productListId}', productListId.toString());
    const response = await api.get<ApiResponse<Product>>(
      `${config.apiBaseUrl}${productsUrl}/${productId}`
    );
    return response.data;
  },

  /**
   * Update a product
   */
  updateProduct: async (productListId: number, productId: number, data: Partial<Product>) => {
    const productsUrl = config.endpoints.productsBase.replace('{productListId}', productListId.toString());
    const response = await api.put<ApiResponse<Product>>(
      `${config.apiBaseUrl}${productsUrl}/${productId}`,
      data
    );
    return response.data;
  },

  /**
   * Create a new product
   */
  createProduct: async (productListId: number, data: Omit<Product, 'id' | 'created_at' | 'is_ai_enriched'>) => {
    const productsUrl = config.endpoints.productsBase.replace('{productListId}', productListId.toString());
    const response = await api.post<ApiResponse<Product>>(
      `${config.apiBaseUrl}${productsUrl}`,
      data
    );
    return response.data;
  },

  generateShareInvite: async (productListId: number) => {
    const response = await api.post<ApiResponse<{invite_code: string}>>(
      `${config.apiBaseUrl}/product-list/share/upload`,
      { productListId }
    );
    return response.data;
  },

getCompanyByInviteCode: async (inviteCode: string) => {
    const response = await axios.get<ApiResponse<{company_id: number, company_name: string, product_list_id: number}>>(
      `${config.apiBaseUrl}/auth/company-details/${inviteCode}`
    );
    return response.data;
  },

  getProductListData: async (productListId: number) => {
    const response = await api.get<ApiResponse<{id: number, list_name: string, company_name: string, productCount: number}>>(
      `${config.apiBaseUrl}/product-list/${productListId}/data`
    );
    return response.data;
  }
};

// Export the API methods
export default {
  login,
  signup,
  logout,
  ...apiMethods
}; 