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
router.get('/auth/invitecode/validity/:inviteCode', authController.checkInviteCodeValidity);

// Protected routes (require authentication)
// Product List routes
router.get('/product-list', authenticateToken, productListController.getProductLists);
router.post('/product-list', authenticateToken, productListController.createProductList);
router.get('/product-list/pipeline', authenticateToken, productListController.getProductListPipeline);
router.post('/product-list/share/upload', authenticateToken, productListController.generateShareInvite);

// Products routes - public access for viewing products
router.get('/product-list/:productListId/products', productsController.getProductsByListId);
router.get('/product-list/:productListId/products/:productId', authenticateToken, productsController.getProductById);

// Product modification routes - public access with company_id parameter
router.post('/product-list/:productListId/products', authenticateToken, productsController.createProduct);
router.put('/product-list/:productListId/products/:productId', authenticateToken, productsController.updateProduct);

// Protected product routes
router.put('/product-list/:productListId/products/global/enrich', authenticateToken, productsController.enrichProducts);
router.put('/product-list/:productListId/products/global/delete', authenticateToken, productsController.deleteProducts);

// Attributes routes
router.get('/product-list/:productListId/attributes', attributesController.getAttributes);

// Routes for attribute management
router.post('/product-list/:productListId/attributes', authenticateToken, attributesController.createAttribute);
router.put('/product-list/:productListId/attributes/:attributeId', authenticateToken, attributesController.updateAttribute);
router.post('/product-list/:productListId/attributes/suggest', authenticateToken, attributesController.suggestAttributes);

// Add the new routes 
router.get('/product-list/upload/presigned-url', authenticateToken, productListController.getPresignedUploadUrl);
router.get('/product-list/upload/sample', productListController.getSampleFile);

// Add this route after existing product-list routes
router.post('/product-list/:productListId/meta', authenticateToken, productListController.updateProductListMeta);

module.exports = router;