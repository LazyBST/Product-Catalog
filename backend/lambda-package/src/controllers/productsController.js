const pool = require('../db');

// Get products by product list ID
const getProductsByListId = async (req, res) => {
  try {
    // Get companyId from query parameter for public access instead of JWT token
    const companyId = req.user?.companyId || req.query.company_id;
    
    if (!companyId) {
      return res.status(400).json({
        success: false,
        errMsg: 'Company ID is required'
      });
    }
    
    const productListId = parseInt(req.params.productListId, 10);
    
    if (isNaN(productListId)) {
      return res.status(400).json({
        success: false,
        errMsg: 'Invalid product list ID'
      });
    }
    
    // Parse query parameters
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 200); // Maximum 200 items per page
    const offset = (page - 1) * limit;
    const name = req.query.name || '';
    const hasImage = req.query.hasImage === 'true' ? true : (req.query.hasImage === 'false' ? false : null);
    const brand = req.query.brand || null;
    const createdFrom = req.query.createdFrom ? parseInt(req.query.createdFrom, 10) : null;
    const createdTo = req.query.createdTo ? parseInt(req.query.createdTo, 10) : null;
    
    // Sort parameters
    const sortField = req.query.sortField || 'created_at';
    const sortOrder = req.query.sortOrder === 'DESC' ? 'DESC' : 'ASC';
    
    // Extract custom field filters from query params
    const customFilters = {};
    for (const [key, value] of Object.entries(req.query)) {
      // Only consider params that are not already processed and look like custom field filters
      if (!['page', 'limit', 'name', 'hasImage', 'brand', 'createdFrom', 'createdTo', 'sortField', 'sortOrder', 'company_id'].includes(key) && value) {
        customFilters[key] = value;
      }
    }
    
    // Check if we're sorting by a custom field from product_ai_fields
    const isCustomSort = sortField.startsWith('custom_');
    let customSortFieldId = null;
    
    if (isCustomSort) {
      // Extract the field ID from the sortField (e.g., 'custom_123' -> '123')
      customSortFieldId = sortField.replace('custom_', '');
    }
    
    // Build the query
    let queryParams = [companyId, productListId]; // Add companyId as first parameter
    let paramCounter = 3; // Start from 3 since we have 2 params already
    
    // Base query with JOIN to product_ai_field_values for both filtering and sorting
    let query = `
      WITH filtered_products AS (
        SELECT 
          p.*,
          pv.data as attribute_values
        FROM 
          products p
        LEFT JOIN 
          product_ai_field_values pv ON p.id = pv.product_id
        WHERE 
          p.company_id = $1 AND p.product_list_id = $2 AND p.is_deleted = FALSE
    `;
    
    // Name filter (using ILIKE for case-insensitive search)
    if (name) {
      query += ` AND p.name ILIKE $${paramCounter++}`;
      queryParams.push(`%${name}%`);
    }
    
    // Image filter
    if (hasImage !== null) {
      query += ` AND p.has_image = $${paramCounter++}`;
      queryParams.push(hasImage);
    }
    
    // Brand filter
    if (brand) {
      query += ` AND p.brand = $${paramCounter++}`;
      queryParams.push(brand);
    }
    
    // Date range filters
    if (createdFrom) {
      query += ` AND p.created_at >= $${paramCounter++}`;
      queryParams.push(createdFrom);
    }
    
    if (createdTo) {
      query += ` AND p.created_at <= $${paramCounter++}`;
      queryParams.push(createdTo);
    }
    
    console.log({customFilters})

    // Apply custom filters on jsonb data
    if (Object.keys(customFilters).length > 0) {
      for (const [fieldName, fieldValue] of Object.entries(customFilters)) {
        const fieldId = fieldName.split('_')[1];
        query += ` AND (pv.data->>'${fieldId}' = $${paramCounter++} OR pv.data->>'${fieldId}' ILIKE $${paramCounter++})`;
        queryParams.push(fieldValue, `%${fieldValue}%`);
      }
    }
    
    // Close the CTE
    query += ')';
    
    // Add sorting
    query += `
      SELECT * FROM filtered_products
    `;
    
    // Handle sorting - either on regular fields or custom fields
    if (isCustomSort && customSortFieldId) {
      // For custom fields, sort using PostgreSQL's ability to sort mixed types
      query += `
        ORDER BY 
          CASE 
            WHEN attribute_values->>'${customSortFieldId}' IS NULL THEN 1
            ELSE 0
          END,
          CASE 
            WHEN attribute_values->>'${customSortFieldId}' ~ '^[0-9]+(\\.[0-9]+)?$' THEN
              (attribute_values->>'${customSortFieldId}')::numeric 
            ELSE NULL
          END ${sortOrder} NULLS LAST,
          CASE 
            WHEN attribute_values->>'${customSortFieldId}' !~ '^[0-9]+(\\.[0-9]+)?$' THEN
              attribute_values->>'${customSortFieldId}'
            ELSE NULL  
          END ${sortOrder} NULLS LAST,
          id ASC
      `;
    } else {
      // For regular fields, use normal sorting
      // Ensure we're only sorting on valid columns to prevent SQL injection
      const validSortFields = ['id', 'name', 'brand', 'barcode', 'created_at', 'is_ai_enriched', 'has_image'];
      const actualSortField = validSortFields.includes(sortField) ? sortField : 'created_at';
      
      query += ` ORDER BY ${actualSortField} ${sortOrder}, id ASC`;
    }
    
    // Add pagination
    query += ` LIMIT $${paramCounter++} OFFSET $${paramCounter++}`;
    queryParams.push(limit, offset);

    
    // Execute the query
    const result = await pool.query(query, queryParams);
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) FROM (
        SELECT p.id
        FROM products p
        LEFT JOIN product_ai_field_values pv ON p.id = pv.product_id
        WHERE p.company_id = $1 AND p.product_list_id = $2 AND p.is_deleted = FALSE
        ${name ? ` AND p.name ILIKE $3` : ''}
        ${hasImage !== null ? ` AND p.has_image = $${name ? 4 : 3}` : ''}
      ) AS product_count
    `;
    
    const countParams = [companyId, productListId];
    if (name) countParams.push(`%${name}%`);
    if (hasImage !== null) countParams.push(hasImage);
    
    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(totalCount / limit);
    
    // Get filterable fields
    const filterableFieldsQuery = `
      SELECT 
        id, 
        field_name as name,
        type
      FROM product_ai_fields 
      WHERE company_id = $1 AND product_list_id = $2 AND is_filterable = TRUE AND is_deleted = FALSE
      ORDER BY field_name ASC
    `;
    
    const filterableFieldsResult = await pool.query(filterableFieldsQuery, [companyId, productListId]);
    
    // Get sortable fields
    const sortableFieldsQuery = `
      SELECT 
        id, 
        field_name as name
      FROM product_ai_fields 
      WHERE company_id = $1 AND product_list_id = $2 AND is_sortable = TRUE AND is_deleted = FALSE
      ORDER BY field_name ASC
    `;
    
    const sortableFieldsResult = await pool.query(sortableFieldsQuery, [companyId, productListId]);
    
    // Format response
    const products = result.rows.map(product => {
      // Parse JSON data if it's a string
      if (product.attribute_values && typeof product.attribute_values === 'string') {
        product.attribute_values = JSON.parse(product.attribute_values);
      }
      
      return product;
    });
    
    res.json({
      success: true,
      data: {
        products,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        },
        filterableFields: filterableFieldsResult.rows,
        sortableFields: sortableFieldsResult.rows
      }
    });
  } catch (error) {
    console.error('Error getting products:', error);
    res.status(500).json({
      success: false,
      errMsg: 'Server error getting products'
    });
  }
};

// Enrich products with AI
const enrichProducts = async (req, res) => {
  try {
    const companyId = req.user.companyId; // Extract company ID from JWT token
    const { productListId, productIds } = req.body;

    // Validate request body
    if (!productListId || isNaN(productListId)) {
      return res.status(400).json({
        success: false,
        data: null,
        errMsg: 'Invalid product list ID'
      });
    }

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0 || productIds.length > 100) {
      return res.status(400).json({
        success: false,
        data: null,
        errMsg: 'Product IDs must be an array with 1-100 items'
      });
    }

    // Get AI-editable fields for the product list
    const fieldsQuery = `
      SELECT 
        id,
        field_name,
        grouping_criteria,
        enrichment_prompt AS prompt,
        type,
        options
      FROM 
        product_ai_fields
      WHERE 
        company_id = $1
        AND product_list_id = $2
        AND is_ai_editable = TRUE
        AND is_deleted = FALSE
    `;

    const fieldsResult = await pool.query(fieldsQuery, [companyId, productListId]);
    
    if (fieldsResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        data: null,
        errMsg: 'No AI-editable fields found for this product list'
      });
    }

    // Get products information
    const productsPlaceholder = productIds.map((_, i) => `$${i + 3}`).join(','); // Start at 3 for params
    const productsQuery = `
      SELECT id, name, brand, barcode
      FROM products
      WHERE company_id = $1 AND product_list_id = $2 AND id IN (${productsPlaceholder})
      AND is_deleted = FALSE
    `;

    const productsParams = [companyId, productListId, ...productIds];
    const productsResult = await pool.query(productsQuery, productsParams);
    
    if (productsResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        data: null,
        errMsg: 'No valid products found'
      });
    }

    // Get OpenAI API key from environment
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.error('OpenAI API key not found');
      return res.status(500).json({
        success: false,
        data: null,
        errMsg: 'OpenAI API key not configured'
      });
    }

    // Initialize OpenAI client
    const openai = require('openai');
    const openaiClient = new openai({
      apiKey: openaiApiKey
    });

    const now = Math.floor(Date.now() / 1000);
    
    // Process each product
    const results = [];
    for (const product of productsResult.rows) {
      // Generate CSV data for all fields
      let fieldPrompts = '';
      for (const field of fieldsResult.rows) {
        // Add field details
        fieldPrompts += `Field Name: ${field.field_name}\n`;
        fieldPrompts += `Field Group: ${field.grouping_criteria || 'General'}\n`;
        fieldPrompts += `Field Type: ${field.type}\n`;
        
        if (field.options && field.options.length > 0) {
          fieldPrompts += `Field Options: ${field.options.join(', ')}\n`;
        }
        
        fieldPrompts += `Field Prompt: ${field.prompt}\n\n`;
      }

      const productInfo = `
Product ID: ${product.id}
Product Name: ${product.name}
Product Brand: ${product.brand || 'N/A'}
Product Barcode: ${product.barcode}
      `.trim();

      // Create the main prompt
      const prompt = `
I need you to analyze the following product and provide enriched data for all the specified fields.

${productInfo}

For each of the following fields, provide a relevant value based on the field description and product information:

${fieldPrompts}

Please format your response as a CSV with one row, having columns for each field name. 
The response should strictly contain ONLY the CSV data and nothing else.
For fields with multiple options, select the most appropriate one based on the product information.
      `.trim();

      try {
        // Make request to OpenAI API
        const response = await openaiClient.chat.completions.create({
          model: "gpt-4o", // or whichever model is appropriate
          messages: [
            {
              role: "system", 
              content: "You are a helpful assistant that enriches product data. Your responses must be in CSV format with only the values, no headers."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1000
        });

        // Parse the CSV response
        const csvResponse = response.choices[0].message.content.trim();
        const values = csvResponse.split(',').map(val => val.trim());
        
        // Create a data object from the response
        const fieldData = {};
        fieldsResult.rows.forEach((field, index) => {
          if (index < values.length) {
            fieldData[field.id] = values[index];
          }
        });

        // Create a JSON object with field IDs as keys
        const jsonData = JSON.stringify(fieldData);

        // Check if record already exists for this product
        const checkQuery = `
          SELECT COUNT(*) as count 
          FROM product_ai_field_values 
          WHERE company_id = $1 AND product_id = $2
        `;
        const checkResult = await pool.query(checkQuery, [companyId, product.id]);
        
        if (parseInt(checkResult.rows[0].count) > 0) {
          // Update existing record
          const updateQuery = `
            UPDATE product_ai_field_values
            SET data = $1, updated_at = $2
            WHERE company_id = $3 AND product_id = $4
          `;
          await pool.query(updateQuery, [jsonData, now, companyId, product.id]);
        } else {
          // Insert new record
          const insertQuery = `
            INSERT INTO product_ai_field_values (company_id, product_id, data, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5)
          `;
          await pool.query(insertQuery, [companyId, product.id, jsonData, now, now]);
        }

        // Update the product's is_ai_enriched flag
        const updateProductQuery = `
          UPDATE products
          SET is_ai_enriched = TRUE, updated_at = $1
          WHERE company_id = $2 AND id = $3
        `;
        await pool.query(updateProductQuery, [now, companyId, product.id]);
        
        results.push({
          productId: product.id,
          success: true
        });
      } catch (enrichError) {
        console.error(`Error enriching product ${product.id}:`, enrichError);
        results.push({
          productId: product.id,
          success: false,
          error: 'Failed to enrich product'
        });
      }
    }

    return res.json({
      success: true,
      data: {
        message: `Enriched ${results.filter(r => r.success).length} out of ${results.length} products`,
        results
      },
      errMsg: null
    });
  } catch (error) {
    console.error('Error enriching products:', error);
    return res.status(500).json({
      success: false,
      data: null,
      errMsg: 'Failed to enrich products'
    });
  }
};

// Soft delete products
const deleteProducts = async (req, res) => {
  try {
    const companyId = req.user.companyId; // Extract company ID from JWT token
    const { productListId, productIds } = req.body;

    // Validate request body
    if (!productListId || isNaN(productListId)) {
      return res.status(400).json({
        success: false,
        data: null,
        errMsg: 'Invalid product list ID'
      });
    }

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0 || productIds.length > 100) {
      return res.status(400).json({
        success: false,
        data: null,
        errMsg: 'Product IDs must be an array with 1-100 items'
      });
    }

    const now = Math.floor(Date.now() / 1000);
    
    // For each product ID, add a parameter placeholder
    const placeholders = productIds.map((_, i) => `$${i + 4}`).join(',');
    const deleteQuery = `
      UPDATE products
      SET is_deleted = TRUE, updated_at = $1
      WHERE company_id = $2 AND product_list_id = $3 AND id IN (${placeholders})
    `;
    const deleteParams = [now, companyId, productListId, ...productIds];
    
    // Execute the query
    const deleteResult = await pool.query(deleteQuery, deleteParams);
    
    if (deleteResult.rowCount === 0) {
      return res.status(400).json({
        success: false,
        data: null,
        errMsg: 'No products found to delete'
      });
    }

    return res.json({
      success: true,
      data: {
        message: `Deleted ${deleteResult.rowCount} products`
      },
      errMsg: null
    });
  } catch (error) {
    console.error('Error deleting products:', error);
    return res.status(500).json({
      success: false,
      data: null,
      errMsg: 'Failed to delete products'
    });
  }
};

// Get product list attributes
const getProductListAttributes = async (req, res) => {
  try {
    const companyId = req.user.companyId; // Extract company ID from JWT token
    const productListId = parseInt(req.params.productListId, 10);

    // Validate product list ID
    if (!productListId || isNaN(productListId)) {
      return res.status(400).json({
        success: false,
        data: null,
        errMsg: 'Invalid product list ID'
      });
    }

    // Query to get all fields for this product list
    const query = `
      SELECT 
        id,
        field_name,
        grouping_criteria as group_name,
        type,
        is_ai_editable,
        is_sortable,
        is_filterable,
        options
      FROM 
        product_ai_fields
      WHERE 
        company_id = $1
        AND product_list_id = $2
        AND is_deleted = FALSE
      ORDER BY
        field_name ASC
    `;

    const result = await pool.query(query, [companyId, productListId]);

    return res.json({
      success: true,
      data: result.rows,
      errMsg: null
    });
  } catch (error) {
    console.error('Error fetching product list attributes:', error);
    return res.status(500).json({
      success: false,
      data: null,
      errMsg: 'Failed to fetch product list attributes'
    });
  }
};

// Get a single product by ID
const getProductById = async (req, res) => {
  try {
    // Get companyId from query parameter for public access instead of JWT token
    const companyId = req.user?.companyId || req.query.company_id;
    
    if (!companyId) {
      return res.status(400).json({
        success: false,
        errMsg: 'Company ID is required'
      });
    }
    
    const productListId = parseInt(req.params.productListId, 10);
    const productId = parseInt(req.params.productId, 10);
    
    if (isNaN(productListId) || isNaN(productId)) {
      return res.status(400).json({
        success: false,
        errMsg: 'Invalid product list ID or product ID'
      });
    }
    
    // Query to get product details
    const query = `
      SELECT 
        p.*,
        pv.data as attribute_values
      FROM 
        products p
      LEFT JOIN 
        product_ai_field_values pv ON p.id = pv.product_id
      WHERE 
        p.company_id = $1 AND 
        p.product_list_id = $2 AND 
        p.id = $3 AND
        p.is_deleted = FALSE
    `;
    
    const result = await pool.query(query, [companyId, productListId, productId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        errMsg: 'Product not found'
      });
    }
    
    const product = result.rows[0];
    
    // Parse JSON data if it's a string
    if (product.attribute_values && typeof product.attribute_values === 'string') {
      product.attribute_values = JSON.parse(product.attribute_values);
    }
    
    res.json({
      success: true,
      data: product,
      errMsg: null
    });
  } catch (error) {
    console.error('Error getting product:', error);
    res.status(500).json({
      success: false,
      errMsg: 'Server error getting product'
    });
  }
};

// Update product
const updateProduct = async (req, res) => {
  try {
    // Get companyId from query parameter for public access instead of JWT token
    const companyId = req.user?.companyId || req.query.company_id;
    
    if (!companyId) {
      return res.status(400).json({
        success: false,
        errMsg: 'Company ID is required'
      });
    }
    
    const productListId = parseInt(req.params.productListId, 10);
    const productId = parseInt(req.params.productId, 10);
    
    if (isNaN(productListId) || isNaN(productId)) {
      return res.status(400).json({
        success: false,
        errMsg: 'Invalid product list ID or product ID'
      });
    }
    
    // Check if product exists and belongs to the product list
    const checkQuery = `
      SELECT id FROM products
      WHERE company_id = $1 AND product_list_id = $2 AND id = $3 AND is_deleted = FALSE
    `;
    
    const checkResult = await pool.query(checkQuery, [companyId, productListId, productId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        errMsg: 'Product not found'
      });
    }
    
    // Get data from request body
    const { name, brand, barcode, image_url, attribute_values } = req.body;
    
    // Validate required fields
    if (!name || !barcode) {
      return res.status(400).json({
        success: false,
        errMsg: 'Product name and barcode are required'
      });
    }
    
    const now = Math.floor(Date.now() / 1000); // Get current Unix timestamp
    
    // Update product in database
    const updateQuery = `
      UPDATE products
      SET name = $1, brand = $2, barcode = $3, image_url = $4, has_image = $5, updated_at = $6
      WHERE company_id = $7 AND id = $8 AND product_list_id = $9
      RETURNING *
    `;
    
    const hasImage = !!image_url;
    
    const updateResult = await pool.query(
      updateQuery, 
      [name, brand || null, barcode, image_url || null, hasImage, now, companyId, productId, productListId]
    );
    
    // Update attribute values if provided
    if (attribute_values && Object.keys(attribute_values).length > 0) {
      // Check if record exists
      const checkValueQuery = `
        SELECT id FROM product_ai_field_values
        WHERE company_id = $1 AND product_id = $2
      `;
      
      const checkValueResult = await pool.query(checkValueQuery, [companyId, productId]);
      
      if (checkValueResult.rows.length > 0) {
        // Update existing record
        const updateValueQuery = `
          UPDATE product_ai_field_values
          SET data = $1, updated_at = $2
          WHERE company_id = $3 AND product_id = $4
          RETURNING *
        `;
        
        await pool.query(updateValueQuery, [JSON.stringify(attribute_values), now, companyId, productId]);
      } else {
        // Insert new record
        const insertValueQuery = `
          INSERT INTO product_ai_field_values (company_id, product_id, data, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `;
        
        await pool.query(insertValueQuery, [companyId, productId, JSON.stringify(attribute_values), now, now]);
      }
    }
    
    // Get the updated product with attribute values
    const getUpdatedQuery = `
      SELECT p.*, pv.data as attribute_values
      FROM products p
      LEFT JOIN product_ai_field_values pv ON p.id = pv.product_id
      WHERE p.company_id = $1 AND p.id = $2
    `;
    
    const getUpdatedResult = await pool.query(getUpdatedQuery, [companyId, productId]);
    
    res.json({
      success: true,
      data: getUpdatedResult.rows[0]
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      errMsg: 'Server error updating product'
    });
  }
};

// Create product
const createProduct = async (req, res) => {
  try {
    // Get companyId from query parameter for public access instead of JWT token
    const companyId = req.user?.companyId || req.query.company_id;
    
    if (!companyId) {
      return res.status(400).json({
        success: false,
        errMsg: 'Company ID is required'
      });
    }
    
    const productListId = parseInt(req.params.productListId, 10);
    
    if (isNaN(productListId)) {
      return res.status(400).json({
        success: false,
        errMsg: 'Invalid product list ID'
      });
    }
    
    // Check if product list exists
    const checkListQuery = `
      SELECT id FROM product_list
      WHERE company_id = $1 AND id = $2
    `;
    
    const checkListResult = await pool.query(checkListQuery, [companyId, productListId]);
    
    if (checkListResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        errMsg: 'Product list not found'
      });
    }
    
    // Get data from request body
    const { name, brand, barcode, image_url, attribute_values } = req.body;
    
    // Validate required fields
    if (!name || !barcode) {
      return res.status(400).json({
        success: false,
        errMsg: 'Product name and barcode are required'
      });
    }
    
    // Insert product in database
    const insertQuery = `
      INSERT INTO products (company_id, product_list_id, name, brand, barcode, image_url, has_image, is_ai_enriched)
      VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
      RETURNING *
    `;
    
    const hasImage = !!image_url;
    
    const insertResult = await pool.query(
      insertQuery, 
      [companyId, productListId, name, brand || null, barcode, image_url || null, hasImage]
    );
    
    const newProduct = insertResult.rows[0];
    
    // Insert attribute values if provided
    if (attribute_values && Object.keys(attribute_values).length > 0) {
      const insertValueQuery = `
        INSERT INTO product_ai_field_values (company_id, product_id, data)
        VALUES ($1, $2, $3)
        RETURNING *
      `;
      
      await pool.query(insertValueQuery, [companyId, newProduct.id, JSON.stringify(attribute_values)]);
    }
    
    // Get the created product with attribute values
    const getCreatedQuery = `
      SELECT p.*, pv.data as attribute_values
      FROM products p
      LEFT JOIN product_ai_field_values pv ON p.id = pv.product_id
      WHERE p.company_id = $1 AND p.id = $2
    `;
    
    const getCreatedResult = await pool.query(getCreatedQuery, [companyId, newProduct.id]);
    
    res.status(201).json({
      success: true,
      data: getCreatedResult.rows[0]
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      errMsg: 'Server error creating product'
    });
  }
};

// Add missing exports
module.exports = {
  getProductsByListId,
  enrichProducts,
  deleteProducts,
  getProductById,
  updateProduct,
  createProduct,
  getProductListAttributes
};