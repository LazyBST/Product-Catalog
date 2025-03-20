const pool = require("../db");

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
  error: row.error,
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
      errMsg: null,
    });
  } catch (error) {
    console.error("Error getting product lists:", error);
    res.status(500).json({
      success: false,
      errMsg: "Server error getting product lists",
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
        errMsg: "List name is required",
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
        errMsg: "A product list with this name already exists",
      });
    }

    const now = Math.floor(Date.now() / 1000);

    // Insert the new product list
    const insertQuery = `
      INSERT INTO product_list (company_id, list_name, created_at, updated_at)
      VALUES ($1, $2, $3, $4)
      RETURNING id, list_name, created_at, updated_at
    `;

    const result = await pool.query(insertQuery, [
      companyId,
      listName,
      now,
      now,
    ]);

    res.status(201).json({
      success: true,
      data: transformProductList(result.rows[0]),
      errMsg: null,
    });
  } catch (error) {
    console.error("Error creating product list:", error);
    res.status(500).json({
      success: false,
      errMsg: "Server error creating product list",
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
        pl.created_at,
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
        plm.created_at DESC NULLS LAST
    `;

    const result = await pool.query(query, [companyId]);

    res.json({
      success: true,
      data: result.rows.map(transformProductList),
      errMsg: null,
    });
  } catch (error) {
    console.error("Error getting product list pipeline:", error);
    res.status(500).json({
      success: false,
      errMsg: "Server error getting product list pipeline",
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

    const result = await pool.query(insertQuery, [
      companyId,
      productListId,
      inviteCode,
    ]);
    console.log(result);

    res.json({
      success: true,
      data: result.rows[0],
      errMsg: null,
    });
  } catch (error) {
    console.error("Error generating share invite:", error);
    res.status(500).json({
      success: false,
      errMsg: "Server error generating share invite",
    });
  }
};

/**
 * Generate a presigned URL for direct upload to S3
 */
const getPresignedUploadUrl = async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const { productListId, fileName } = req.query;

    if (!productListId || !fileName) {
      return res.status(400).json({
        success: false,
        errMsg: "Product list ID and file name are required",
      });
    }

    // Check if the product list belongs to the company
    const checkQuery = `
      SELECT id FROM product_list 
      WHERE company_id = $1 AND id = $2
    `;
    const checkResult = await pool.query(checkQuery, [
      companyId,
      productListId,
    ]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        errMsg: "Product list not found",
      });
    }

    // Get S3 bucket from environment variables
    const bucketName = process.env.MY_S3_BUCKET_NAME;
    if (!bucketName) {
      return res.status(500).json({
        success: false,
        errMsg: "S3 bucket name not configured",
      });
    }

    // Generate a cleaned filename (remove any path info, etc)
    // randomise the filename
    const randomFileName =
      Math.random().toString(36).substring(2, 15) + "_" + fileName;

    // Create the S3 key (path) using the pattern: <bucket_name>/company_id/product-list-id/original/file.csv
    const s3Key = `${companyId}/${productListId}/original/${randomFileName}`;

    // Load AWS SDK
    const AWS = require("aws-sdk");

    // Configure AWS with credentials from environment variables
    AWS.config.update({
      accessKeyId: process.env.MY_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.MY_AWS_SECRET_ACCESS_KEY,
      region: process.env.MY_AWS_REGION || "us-east-1",
    });

    // Create S3 service object
    const s3 = new AWS.S3();

    // Set up parameters for presigned URL
    const params = {
      Bucket: bucketName,
      Key: s3Key,
      Expires: 3600, // URL expires in 1 hour
      ContentType: "text/csv",
    };

    // Generate the presigned URL
    const presignedUrl = s3.getSignedUrl("putObject", params);

    // Return the presigned URL and file information
    res.json({
      success: true,
      data: {
        url: presignedUrl,
        bucket: bucketName,
        key: s3Key,
        expires: 3600,
      },
      errMsg: null,
    });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    res.status(500).json({
      success: false,
      errMsg: "Server error generating presigned URL",
    });
  }
};

/**
 * Get a sample file for product upload
 */
const getSampleFile = (req, res) => {
  try {
    // Create a CSV with headers
    const csvHeaders = "Product Name,Image Url,Brand,Barcode";

    // Set response headers for file download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="product_upload_sample.csv"'
    );

    // Send the CSV content
    res.send(csvHeaders);
  } catch (error) {
    console.error("Error generating sample file:", error);
    res.status(500).json({
      success: false,
      errMsg: "Server error generating sample file",
    });
  }
};

/**
 * Update product list meta after file upload
 */
const updateProductListMeta = async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const { productListId } = req.params;
    const { filePath, inviteCode } = req.body;

    if (!productListId || !filePath) {
      return res.status(400).json({
        success: false,
        errMsg: "Product list ID and file path are required",
      });
    }

    // Check if the product list belongs to the company
    const checkQuery = `
      SELECT id FROM product_list 
      WHERE company_id = $1 AND id = $2
    `;
    const checkResult = await pool.query(checkQuery, [
      companyId,
      productListId,
    ]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        errMsg: "Product list not found",
      });
    }

    // If invite code is present, update the existing row
    if (inviteCode) {
      const updateQuery = `
        UPDATE product_list_meta
        SET 
          file_path = $1,
          file_status = 'uploaded',
          is_invite_expired = TRUE,
          updated_at = $2
        WHERE 
          invite_code = $3 AND company_id = $4
        RETURNING id
      `;

      const now = Math.floor(Date.now() / 1000);
      const updateResult = await pool.query(updateQuery, [
        filePath,
        now,
        inviteCode,
        companyId,
      ]);

      if (updateResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          errMsg: "Invite code not found",
        });
      }

      return res.json({
        success: true,
        data: { id: updateResult.rows[0].id },
        errMsg: null,
      });
    } else {
      // If no invite code, create a new entry
      const insertQuery = `
        INSERT INTO product_list_meta (
          company_id,
          product_list_id,
          file_path,
          file_status,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, 'uploaded', $4, $4)
        RETURNING id
      `;

      const now = Math.floor(Date.now() / 1000);
      const insertResult = await pool.query(insertQuery, [
        companyId,
        productListId,
        filePath,
        now,
      ]);

      return res.json({
        success: true,
        data: { id: insertResult.rows[0].id },
        errMsg: null,
      });
    }
  } catch (error) {
    console.error("Error updating product list meta:", error);
    res.status(500).json({
      success: false,
      errMsg: "Server error updating product list meta",
    });
  }
};

module.exports = {
  getProductLists,
  createProductList,
  getProductListPipeline,
  generateShareInvite,
  getPresignedUploadUrl,
  getSampleFile,
  updateProductListMeta,
};
