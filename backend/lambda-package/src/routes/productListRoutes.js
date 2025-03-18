const express = require("express");
const {
  getProductLists,
  getProductListPipeline,
  createProductList,
  generateShareInvite
} = require("../controllers/productListController");
const router = express.Router();

// GET /api/product-list - Get all product lists
router.get("/", getProductLists);

// POST /api/product-list - Create a new product list
router.post("/", createProductList);

// GET /api/product-list/pipeline - Get product list pipeline data
router.get("/pipeline", getProductListPipeline);

// POST /api/product-list/share/upload - Generate a share invite for a product list
router.post("/share/upload", generateShareInvite);

module.exports = router;
