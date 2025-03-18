const pool = require('../db');
const openai = require('openai');

/**
 * Get attributes for a product list
 * GET /api/product-list/:productListId/attributes
 */
const getAttributes = async (req, res) => {
  try {
    const productListId = parseInt(req.params.productListId, 10);
    // Get companyId from query parameter for public access instead of JWT token
    const companyId = req.user?.companyId || req.query.company_id;
    
    if (!companyId) {
      return res.status(400).json({
        success: false,
        errMsg: 'Company ID is required'
      });
    }
    
    if (isNaN(productListId)) {
      return res.status(400).json({
        success: false,
        errMsg: 'Invalid product list ID'
      });
    }
    
    // Define system fields
    const systemAttributes = [
      {
        id: 'name',
        name: 'Product name',
        type: 'text',
        group: 'System',
        isFilterable: true,
        isSortable: false, // Not sortable
        isRequired: true,
        isAiEnriched: false,
        isMultiValue: false,
        isSystem: true,
        options: [],
        prompt: ''
      },
      {
        id: 'brand',
        name: 'Brand',
        type: 'text',
        group: 'System',
        isFilterable: true,
        isSortable: false, // Not sortable
        isRequired: false,
        isAiEnriched: false,
        isMultiValue: false,
        isSystem: true,
        options: [],
        prompt: ''
      },
      {
        id: 'barcode',
        name: 'Barcode',
        type: 'text',
        group: 'System',
        isFilterable: true,
        isSortable: true,
        isRequired: false,
        isAiEnriched: false,
        isMultiValue: false,
        isSystem: true,
        options: [],
        prompt: ''
      },
      {
        id: 'created_at',
        name: 'Created at',
        type: 'date',
        group: 'System',
        isFilterable: true,
        isSortable: true,
        isRequired: false,
        isAiEnriched: false,
        isMultiValue: false,
        isSystem: true,
        options: [],
        prompt: ''
      }
    ];
    
    // Get custom fields
    const customFieldsResult = await pool.query(
      `SELECT 
        id,
        field_name,
        type,
        enrichment_prompt,
        grouping_criteria,
        is_ai_editable,
        is_filterable,
        is_sortable,
        options
      FROM product_ai_fields
      WHERE company_id = $1 AND product_list_id = $2 AND is_deleted = FALSE
      ORDER BY field_name ASC`,
      [companyId, productListId]
    );
    console.log({companyId, customFieldsResult, productListId})
    // Map DB fields to frontend format
    const customAttributes = customFieldsResult.rows.map(row => ({
      id: row.id,
      name: row.field_name,
      type: mapDbTypeToFrontend(row.type),
      group: row.grouping_criteria || 'Custom',
      prompt: row.enrichment_prompt || '',
      isAiEnriched: Boolean(row.is_ai_editable),
      isFilterable: Boolean(row.is_filterable),
      isSortable: Boolean(row.is_sortable),
      isRequired: false, // Default value since column doesn't exist
      isMultiValue: row.type === 'multiple_select', // Derive from type
      isSystem: false,
      options: row.options || []
    }));
    
    // Combine system and custom attributes
    const attributes = [...systemAttributes, ...customAttributes];
    
    res.json({
      success: true,
      data: {
        systemAttributes,
        customAttributes
      }
    });
  } catch (error) {
    console.error('Error getting attributes:', error);
    res.status(500).json({
      success: false,
      errMsg: 'Server error getting attributes'
    });
  }
};

/**
 * Create a new attribute for a product list
 */
const createAttribute = async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const productListId = parseInt(req.params.productListId, 10);
    const {
      fieldName,
      groupingCriteria,
      isAiEditable,
      isSortable,
      isFilterable,
      type,
      options,
      enrichmentPrompt
    } = req.body;
    
    if (!fieldName || !type) {
      return res.status(400).json({
        success: false,
        errMsg: 'Field name and type are required'
      });
    }
    
    // Check if product list exists
    const checkListQuery = `
      SELECT id FROM product_list WHERE company_id = $1 AND id = $2
    `;
    const checkListResult = await pool.query(checkListQuery, [companyId, productListId]);
    
    if (checkListResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        errMsg: 'Product list not found'
      });
    }
    
    // Check if field name already exists
    const checkFieldQuery = `
      SELECT id FROM product_ai_fields
      WHERE company_id = $1 AND product_list_id = $2 AND field_name = $3 AND is_deleted = FALSE
    `;
    const checkFieldResult = await pool.query(checkFieldQuery, [companyId, productListId, fieldName]);
    
    if (checkFieldResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        errMsg: 'A field with this name already exists'
      });
    }
    
    const now = Math.floor(Date.now() / 1000);
    
    // Insert new attribute
    const insertQuery = `
      INSERT INTO product_ai_fields (
        company_id,
        product_list_id,
        field_name,
        grouping_criteria,
        is_ai_editable,
        is_sortable,
        is_filterable,
        type,
        options,
        enrichment_prompt,
        is_ai_suggested,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, field_name, grouping_criteria as group_name, type, is_ai_editable, is_sortable, is_filterable, options
    `;
    
    const params = [
      companyId,
      productListId,
      fieldName,
      groupingCriteria || null,
      isAiEditable !== undefined ? isAiEditable : true,
      isSortable !== undefined ? isSortable : false,
      isFilterable !== undefined ? isFilterable : false,
      type,
      options || null,
      enrichmentPrompt || null,
      false, // is_ai_suggested
      now,
      now
    ];
    
    const result = await pool.query(insertQuery, params);
    
    res.status(201).json({
      success: true,
      data: result.rows[0],
      errMsg: null
    });
  } catch (error) {
    console.error('Error creating attribute:', error);
    res.status(500).json({
      success: false,
      errMsg: 'Server error creating attribute'
    });
  }
};

/**
 * Update an attribute
 */
const updateAttribute = async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const productListId = parseInt(req.params.productListId, 10);
    const attributeId = parseInt(req.params.attributeId, 10);
    
    if (isNaN(productListId) || isNaN(attributeId)) {
      return res.status(400).json({
        success: false,
        errMsg: 'Invalid product list ID or attribute ID'
      });
    }
    
    const {
      fieldName,
      groupingCriteria,
      isAiEditable,
      isSortable,
      isFilterable,
      type,
      options,
      enrichmentPrompt
    } = req.body;
    
    // Check if attribute exists
    const checkQuery = `
      SELECT id FROM product_ai_fields
      WHERE company_id = $1 AND product_list_id = $2 AND id = $3 AND is_deleted = FALSE
    `;
    
    const checkResult = await pool.query(checkQuery, [companyId, productListId, attributeId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        errMsg: 'Attribute not found'
      });
    }
    
    // Build update query
    let updateQuery = 'UPDATE product_ai_fields SET updated_at = $1';
    const now = Math.floor(Date.now() / 1000);
    const params = [now];
    let paramIndex = 2;
    
    if (fieldName !== undefined) {
      updateQuery += `, field_name = $${paramIndex++}`;
      params.push(fieldName);
    }
    
    if (groupingCriteria !== undefined) {
      updateQuery += `, grouping_criteria = $${paramIndex++}`;
      params.push(groupingCriteria);
    }
    
    if (isAiEditable !== undefined) {
      updateQuery += `, is_ai_editable = $${paramIndex++}`;
      params.push(isAiEditable);
    }
    
    if (isSortable !== undefined) {
      updateQuery += `, is_sortable = $${paramIndex++}`;
      params.push(isSortable);
    }
    
    if (isFilterable !== undefined) {
      updateQuery += `, is_filterable = $${paramIndex++}`;
      params.push(isFilterable);
    }
    
    if (type !== undefined) {
      updateQuery += `, type = $${paramIndex++}`;
      params.push(type);
    }
    
    if (options !== undefined) {
      updateQuery += `, options = $${paramIndex++}`;
      params.push(options);
    }
    
    if (enrichmentPrompt !== undefined) {
      updateQuery += `, enrichment_prompt = $${paramIndex++}`;
      params.push(enrichmentPrompt);
    }
    
    updateQuery += ` WHERE company_id = $${paramIndex++} AND product_list_id = $${paramIndex++} AND id = $${paramIndex++} RETURNING id, field_name, grouping_criteria as group_name, type, is_ai_editable, is_sortable, is_filterable, options`;
    params.push(companyId, productListId, attributeId);
    
    const result = await pool.query(updateQuery, params);
    
    res.json({
      success: true,
      data: result.rows[0],
      errMsg: null
    });
  } catch (error) {
    console.error('Error updating attribute:', error);
    res.status(500).json({
      success: false,
      errMsg: 'Server error updating attribute'
    });
  }
};

/**
 * Suggest attributes using AI
 */
const suggestAttributes = async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const productListId = parseInt(req.params.productListId, 10);
    
    // Verify product list exists
    const checkListQuery = `
      SELECT pl.id, pl.list_name 
      FROM product_list pl
      WHERE pl.company_id = $1 AND pl.id = $2
    `;
    
    const productListResult = await pool.query(checkListQuery, [companyId, productListId]);
    
    if (productListResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        errMsg: 'Product list not found'
      });
    }
    
    const productListName = productListResult.rows[0].list_name;
    
    // Get some sample products from the list
    const sampleProductsQuery = `
      SELECT name, brand, barcode 
      FROM products 
      WHERE company_id = $1 AND product_list_id = $2 AND is_deleted = FALSE
      LIMIT 20
    `;
    
    const sampleProductsResult = await pool.query(sampleProductsQuery, [companyId, productListId]);
    
    if (sampleProductsResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        errMsg: 'No products found in this list for suggestion'
      });
    }
    
    // Format sample products as CSV
    const headers = ['name', 'brand', 'barcode'];
    const csvData = [
      headers.join(','),
      ...sampleProductsResult.rows.map(product => 
        headers.map(header => product[header] || '').join(',')
      )
    ].join('\n');
    
    // Get OpenAI API key from environment
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.error('OpenAI API key not found');
      return res.status(500).json({
        success: false,
        errMsg: 'OpenAI API key not configured'
      });
    }
    
    // Get the template prompt from environment
    const attributeSuggestionPrompt = process.env.ATTRIBUTE_SUGGESTION_PROMPT;
    if (!attributeSuggestionPrompt) {
      return res.status(500).json({
        success: false,
        errMsg: 'Attribute suggestion prompt not configured'
      });
    }
    
    // Format the prompt
    const prompt = attributeSuggestionPrompt
      .replace('{productListName}', productListName)
      .replace('{csvData}', csvData);
    
    // Initialize OpenAI client
    const openaiClient = new openai({
      apiKey: openaiApiKey
    });
    
    // Call OpenAI API
    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that suggests product attributes based on sample data."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });
    
    const aiResponse = response.choices[0].message.content.trim();
    
    // Parse CSV response
    const suggestedAttributes = [];
    console.log({aiResponse});
    
    // Extract content between any possible code blocks and split by lines
    let content = aiResponse;
    if (aiResponse.includes('```')) {
      content = aiResponse.replace(/```(?:csv)?([\s\S]*?)```/g, '$1').trim();
    }
    
    const csvLines = content.split('\n');
    
    // Skip the header row (first line) entirely
    if (csvLines.length > 1) {
      // Process only data rows (skip first row)
      for (let i = 1; i < csvLines.length; i++) {
        const line = csvLines[i].trim();
        if (!line) continue;
        
        // First split the line into fields and the rest (which contains options)
        // We know the first 4 columns (name,group,type,prompt) followed by options
        const match = line.match(/^((?:"[^"]*"|[^,"])+),((?:"[^"]*"|[^,"])+),((?:"[^"]*"|[^,"])+),((?:"[^"]*"|[^,"])+),(.*)$/);
        
        if (match) {
          // Extract the first 4 fields
          const name = match[1].replace(/^"(.*)"$/, '$1').trim();
          const group = match[2].replace(/^"(.*)"$/, '$1').trim();
          const type = match[3].replace(/^"(.*)"$/, '$1').trim();
          const prompt = match[4].replace(/^"(.*)"$/, '$1').trim();
          
          // The rest is options
          const optionsString = match[5].trim();
          
          // Split options by comma, but respect quoted strings
          const options = optionsString.split(',').map(opt => opt.trim()).filter(opt => opt);
          
          suggestedAttributes.push({
            name,
            group,
            type,
            prompt,
            options: options.length > 0 ? options : null
          });
        }
      }
    }
    
    // Store suggested attributes in the database
    const now = Math.floor(Date.now() / 1000);
    try {
      const insertPromises = suggestedAttributes.map(async attr => {
        const insertQuery = `
          INSERT INTO product_ai_fields (
            company_id,
            product_list_id,
            field_name,
            grouping_criteria,
            is_ai_editable,
            is_sortable,
            is_filterable,
            type,
            options,
            enrichment_prompt,
            is_ai_suggested,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id
        `;
        
        const params = [
          companyId,
          productListId,
          attr.name,
          attr.group || null,
          true, // is_ai_editable
          false, // is_sortable
          false,  // is_filterable
          mapFrontendTypeToDb(attr.type),
          attr.options,
          attr.prompt || null,
          true,  // is_ai_suggested
          now,
          now
        ];
        
        return pool.query(insertQuery, params);
      });
      
      await Promise.all(insertPromises);
      console.log(`Stored ${suggestedAttributes.length} suggested attributes in database`);
      
      res.json({
        success: true,
        data: suggestedAttributes,
        errMsg: null
      });
    } catch (dbError) {
      console.error('Error storing suggested attributes:', dbError);
      res.status(500).json({
        success: false,
        data: null,
        errMsg: 'Failed to store suggested attributes in database'
      });
    }
  } catch (error) {
    console.error('Error suggesting attributes:', error);
    res.status(500).json({
      success: false,
      errMsg: 'Server error suggesting attributes'
    });
  }
};

/**
 * Helper function to map DB type to frontend type
 */
function mapDbTypeToFrontend(dbType) {
  const mapping = {
    'short_text': 'text',
    'long_text': 'text',
    'number': 'number',
    'single_select': 'single_select',
    'multiple_select': 'multiple_select'
  };
  
  return mapping[dbType] || 'text';
}

/**
 * Helper function to map frontend type to DB type
 */
function mapFrontendTypeToDb(frontendType) {
  const mapping = {
    'text': 'short_text',
    'number': 'number',
    'single_select': 'single_select',
    'multiple_select': 'multiple_select'
  };
  
  return mapping[frontendType] || 'short_text';
}

module.exports = {
  getAttributes,
  createAttribute,
  updateAttribute,
  suggestAttributes
}; 