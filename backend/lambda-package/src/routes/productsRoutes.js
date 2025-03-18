const express = require('express');
const router = express.Router({ mergeParams: true });
const {
  getProductsByListId,
  enrichProducts,
  deleteProducts,
  getProductById,
  updateProduct,
  createProduct
} = require('../controllers/productsController');

// GET /api/:productListId/products - Get products for a product list
router.get('/', getProductsByListId);

// GET /api/:productListId/products/:productId - Get a single product by ID
router.get('/:productId', getProductById);

// PUT /api/:productListId/products/:productId - Update a product
router.put('/:productId', updateProduct);

// POST /api/:productListId/products - Create a new product
router.post('/', createProduct);

// These are global operations not specific to a product list, so they should be moved elsewhere or kept as-is
// PUT /api/products/enrich - Enrich products with AI
router.put('/global/enrich', enrichProducts);

// PUT /api/products/delete - Delete products (soft delete)
router.put('/global/delete', deleteProducts);

module.exports = router; 