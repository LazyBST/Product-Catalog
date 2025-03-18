const config = {
  apiBaseUrl: 'https://i8xe5quzta.execute-api.ap-south-1.amazonaws.com/prod/api',
  apiUrl: 'https://i8xe5quzta.execute-api.ap-south-1.amazonaws.com/prod/api',
  endpoints: {
    productList: '/product-list',
    productListPipeline: '/product-list/pipeline',
    productsBase: '/product-list/{productListId}/products',
    attributes: '/product-list/{productListId}/attributes'
  }
};

export default config; 