const express = require('express');
const router = express.Router();
const productListController = require('../controllers/productListController');
const productsController = require('../controllers/productsController');
const attributesController = require('../controllers/attributesController');
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Auth routes (no authentication required)
router.post('/auth/login', authController.login);
router.post('/auth/signup', authController.signup);
router.get('/auth/company-details/:inviteCode', authController.getCopanyDetailsForInviteCode);

// Protected routes (require authentication)
// Product List routes
router.get('/product-list', authenticateToken, productListController.getProductLists);
router.post('/product-list', authenticateToken, productListController.createProductList);
router.get('/product-list/pipeline', authenticateToken, productListController.getProductListPipeline);
router.post('/product-list/share/upload', authenticateToken, productListController.generateShareInvite);
// Products routes
router.get('/product-list/:productListId/products', authenticateToken, productsController.getProductsByListId);
router.get('/product-list/:productListId/products/:productId', authenticateToken, productsController.getProductById);
router.post('/product-list/:productListId/products', authenticateToken, productsController.createProduct);
router.put('/product-list/:productListId/products/:productId', authenticateToken, productsController.updateProduct);
router.put('/product-list/:productListId/products/global/enrich', authenticateToken, productsController.enrichProducts);
router.put('/product-list/:productListId/products/global/delete', authenticateToken, productsController.deleteProducts);

// Attributes routes
router.get('/product-list/:productListId/attributes', authenticateToken, attributesController.getAttributes);

// Routes for attribute management
router.post('/product-list/:productListId/attributes', authenticateToken, attributesController.createAttribute);
router.put('/product-list/:productListId/attributes/:attributeId', authenticateToken, attributesController.updateAttribute);
router.post('/product-list/:productListId/attributes/suggest', authenticateToken, attributesController.suggestAttributes);

module.exports = router;