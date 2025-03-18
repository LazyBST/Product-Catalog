const pool = require('../db');

/**
 * Transform database row to camelCase response
 */
const transformProductList = (row) => ({
  id: row.id,
  listName: row.list_name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  productsCount: row.products_count,
  fileStatus: row.file_status,
  totalBatches: row.total_batches,
  processedBatches: row.processed_batches,
  lastProcessedAt: row.last_processed_at,
  error: row.error
});

/**
 * Get all product lists for a company
 */
const getProductLists = async (req, res) => {
  try {
    const companyId = req.user.companyId;
    
    const query = `
      SELECT 
        pl.id, 
        pl.list_name, 
        pl.created_at,
        pl.updated_at,
        COUNT(p.id) as products_count
      FROM 
        product_list pl
      LEFT JOIN 
        products p ON pl.id = p.product_list_id AND p.company_id = pl.company_id AND p.is_deleted = FALSE
      WHERE 
        pl.company_id = $1
      GROUP BY 
        pl.id, pl.list_name, pl.created_at, pl.updated_at
      ORDER BY 
        pl.created_at DESC
    `;
    
    const result = await pool.query(query, [companyId]);
    
    res.json({
      success: true,
      data: result.rows.map(transformProductList),
      errMsg: null
    });
  } catch (error) {
    console.error('Error getting product lists:', error);
    res.status(500).json({
      success: false,
      errMsg: 'Server error getting product lists'
    });
  }
};

/**
 * Create a new product list
 */
const createProductList = async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const { listName } = req.body;
    
    if (!listName) {
      return res.status(400).json({
        success: false,
        errMsg: 'List name is required'
      });
    }
    
    // Check if list name already exists for this company
    const checkQuery = `
      SELECT COUNT(*) FROM product_list 
      WHERE company_id = $1 AND list_name = $2
    `;
    
    const checkResult = await pool.query(checkQuery, [companyId, listName]);
    
    if (parseInt(checkResult.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        errMsg: 'A product list with this name already exists'
      });
    }
    
    const now = Math.floor(Date.now() / 1000);
    
    // Insert the new product list
    const insertQuery = `
      INSERT INTO product_list (company_id, list_name, created_at, updated_at)
      VALUES ($1, $2, $3, $4)
      RETURNING id, list_name, created_at, updated_at
    `;
    
    const result = await pool.query(insertQuery, [companyId, listName, now, now]);
    
    res.status(201).json({
      success: true,
      data: transformProductList(result.rows[0]),
      errMsg: null
    });
  } catch (error) {
    console.error('Error creating product list:', error);
    res.status(500).json({
      success: false,
      errMsg: 'Server error creating product list'
    });
  }
};

/**
 * Get product list pipeline status
 */
const getProductListPipeline = async (req, res) => {
  try {
    const companyId = req.user.companyId;
    
    const query = `
      SELECT 
        pl.id, 
        pl.list_name,
        plm.file_status,
        plm.total_batches,
        plm.processed_batches,
        plm.last_processed_at,
        plm.error
      FROM 
        product_list pl
      JOIN 
        product_list_meta plm ON pl.id = plm.product_list_id AND pl.company_id = plm.company_id
      WHERE 
        pl.company_id = $1
      ORDER BY 
        plm.last_processed_at DESC NULLS LAST
    `;
    
    const result = await pool.query(query, [companyId]);
    
    res.json({
      success: true,
      data: result.rows.map(transformProductList),
      errMsg: null
    });
  } catch (error) {
    console.error('Error getting product list pipeline:', error);
    res.status(500).json({
      success: false,
      errMsg: 'Server error getting product list pipeline'
    });
  }
};

const generateShareInvite = async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const { productListId } = req.body;

    const inviteCode = Math.random().toString(36).substring(2, 15);

    const insertQuery = `
      INSERT INTO product_list_meta (company_id, product_list_id, invite_code)
      VALUES ($1, $2, $3)
      RETURNING id, company_id, product_list_id, invite_code
    `;

    console.log(companyId, productListId, inviteCode);

    const result = await pool.query(insertQuery, [companyId, productListId, inviteCode]);
    console.log(result);

    res.json({
      success: true,
      data: result.rows[0],
      errMsg: null
    });
  } catch (error) {
    console.error('Error generating share invite:', error);
    res.status(500).json({
      success: false,
      errMsg: 'Server error generating share invite'
    });
  }
};

module.exports = {
  getProductLists,
  createProductList,
  getProductListPipeline,
  generateShareInvite
}; 