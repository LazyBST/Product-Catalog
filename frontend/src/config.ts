const config = {
  apiBaseUrl: 'http://localhost:5006/api',
  apiUrl: 'http://localhost:5006/api',
  endpoints: {
    productList: '/product-list',
    productListPipeline: '/product-list/pipeline',
    productsBase: '/product-list/{productListId}/products',
    attributes: '/product-list/{productListId}/attributes'
  }
};

export default config; 