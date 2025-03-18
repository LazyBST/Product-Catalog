const express = require('express');
const router = express.Router();
const { getAttributes, createAttribute, updateAttribute } = require('../controllers/attributesController');

// Get attributes for a product list
router.get('/:productListId/attributes', getAttributes);

// Create new attribute
router.post('/:productListId/attributes', createAttribute);

// Update attribute
router.put('/:productListId/attributes/:attributeId', updateAttribute);

module.exports = router; 