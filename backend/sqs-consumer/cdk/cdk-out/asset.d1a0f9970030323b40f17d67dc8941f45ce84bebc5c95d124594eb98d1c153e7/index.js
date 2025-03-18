/**
 * Lambda function to consume messages from SQS queue and log the complete event body
 */

exports.handler = async (event) => {
  console.log('[DEBUG] Lambda invocation started with event:', JSON.stringify(event, null, 2));
  console.log('[DEBUG] Lambda function version:', process.env.AWS_LAMBDA_FUNCTION_VERSION);
  console.log('[DEBUG] Lambda function memory:', process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE);
  console.log('[DEBUG] Lambda function timeout:', process.env.AWS_LAMBDA_FUNCTION_TIMEOUT);
  
  // Import the AWS SDK at runtime - Node.js Lambda runtime has AWS SDK v3 available
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const s3Client = new S3Client({ region: 'ap-south-1' });
  const fs = require('fs');
  const path = require('path');
  const csvParser = require('csv-parser');
  const { Transform } = require('stream');
  const { pipeline } = require('stream/promises');
  
  // Import pg with better error handling
  let pg;
  let Pool;
  
  try {
    pg = require('pg');
    console.log('[DEBUG] Successfully required pg module. Version:', pg.version);
    Pool = pg.Pool;
    console.log('[DEBUG] Successfully accessed Pool class from pg module');
  } catch (pgError) {
    console.error('[ERROR] Failed to import pg module:', {
      error: pgError.message,
      stack: pgError.stack
    });
    throw new Error(`Failed to import pg module: ${pgError.message}`);
  }
  
  // Global pool variable
  let pool = null;
  
  try {
    // Get database credentials from environment variables
    const dbConfig = {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      // Add connection timeout settings
      connectionTimeoutMillis: 10000, // 10 seconds
      query_timeout: 30000, // 30 seconds
      // Add connection retry settings
      max: 5, // maximum number of clients in the pool
      idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
    };
    
    // Log database connection details (without password)
    console.log('[DEBUG] Connecting to database:', {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      ssl: !!dbConfig.ssl,
      connectionTimeoutMillis: dbConfig.connectionTimeoutMillis
    });
    
    // Testing VPC DNS resolution
    try {
      const dns = require('dns');
      const dnsPromises = dns.promises;
      console.log('[DEBUG] Resolving database hostname...');
      const addresses = await dnsPromises.lookup(dbConfig.host);
      console.log('[DEBUG] Successfully resolved database hostname:', addresses);
    } catch (dnsError) {
      console.error('[ERROR] Failed to resolve database hostname:', {
        host: dbConfig.host,
        error: dnsError.message
      });
    }
    
    // Create a connection pool for database operations with retry logic
    pool = await createDatabasePoolWithRetry(Pool, dbConfig);
    
    // Process each record from the SQS queue
    const records = event.Records || [];
    console.log(`[DEBUG] Processing ${records.length} message(s) from SQS queue`);
    
    for (const record of records) {
      // Log the message details
      console.log('[DEBUG] Processing SQS message:', {
        messageId: record.messageId,
        eventSourceARN: record.eventSourceARN,
        messageAttributes: record.messageAttributes
      });
      
      // Parse the message body
      let messageBody;
      try {
        messageBody = JSON.parse(record.body);
        console.log('[DEBUG] Successfully parsed message body:', JSON.stringify(messageBody, null, 2));
        
        // Process S3 events
        if (messageBody.Records && messageBody.Records[0] && messageBody.Records[0].s3) {
          console.log('[DEBUG] Valid S3 event detected in message');
          const s3Record = messageBody.Records[0].s3;
          const bucketName = s3Record.bucket.name;
          const objectKey = decodeURIComponent(s3Record.object.key.replace(/\+/g, ' '));
          
          console.log('[DEBUG] S3 event details:', {
            eventName: s3Record.eventName,
            bucketName: bucketName,
            objectKey: objectKey,
            objectSize: s3Record.object.size,
            eventTime: s3Record.eventTime
          });
          
          // Extract company_id and product_list_id from the object key
          const keyParts = objectKey.split('/');
          if (keyParts.length < 2) {
            const errorMsg = 'Invalid object key format. Expected format: company_id/product_list_id/filename.csv';
            console.error('[ERROR]', errorMsg);
            
            // Update database with error
            await updateDatabase(pool, {
              company_id: 0, // Default value since we couldn't extract
              product_list_id: 0, // Default value since we couldn't extract
              file_path: objectKey,
              file_status: 'error',
              total_batches: 0,
              processed_batches: 0,
              error: errorMsg
            });
            
            continue;
          }
          
          const company_id = parseInt(keyParts[0], 10);
          const product_list_id = parseInt(keyParts[1], 10);
          
          if (isNaN(company_id) || isNaN(product_list_id)) {
            const errorMsg = 'Invalid company_id or product_list_id in object key. Both should be numeric.';
            console.error('[ERROR]', errorMsg);
            
            // Update database with error
            await updateDatabase(pool, {
              company_id: isNaN(company_id) ? 0 : company_id,
              product_list_id: isNaN(product_list_id) ? 0 : product_list_id,
              file_path: objectKey,
              file_status: 'error',
              total_batches: 0,
              processed_batches: 0,
              error: errorMsg
            });
            
            continue;
          }
          
          console.log('[DEBUG] Extracted IDs:', {
            company_id,
            product_list_id
          });
          
          // Download the file from S3
          const getObjectParams = {
            Bucket: bucketName,
            Key: objectKey
          };
          
          try {
            const getObjectResponse = await s3Client.send(new GetObjectCommand(getObjectParams));
            
            // Process and refine the CSV file
            const tempDir = '/tmp';
            const localFilePath = path.join(tempDir, 'original.csv');
            const outputStream = fs.createWriteStream(localFilePath);
            
            await pipeline(
              getObjectResponse.Body,
              outputStream
            );
            
            console.log('[DEBUG] File downloaded to:', localFilePath);
            
            // Process the CSV file
            const results = [];
            const barcodeSet = new Set();
            let headerValid = false;
            let totalRowsProcessed = 0;
            let rowsAfterRefining = 0;
            let processingError = null;
            
            try {
              // Create a transform stream to validate each row
              const validateRow = new Transform({
                objectMode: true,
                transform(row, encoding, callback) {
                  totalRowsProcessed++;
                  
                  // Check if the row has required fields
                  if (!row['Product Name'] || !row['Barcode']) {
                    return callback(null); // Skip this row
                  }
                  
                  // Check if barcode is numeric
                  const barcode = row['Barcode'].trim();
                  if (!/^\d+$/.test(barcode)) {
                    return callback(null); // Skip this row
                  }
                  
                  // Check for duplicate barcodes
                  if (barcodeSet.has(barcode)) {
                    return callback(null); // Skip this row
                  }
                  
                  // Add barcode to set
                  barcodeSet.add(barcode);
                  
                  // Add company_id and product_list_id to the row
                  const refinedRow = {
                    'Product Name': row['Product Name'],
                    'Image Url': row['Image Url'] || '',
                    'Brand': row['Brand'] || '',
                    'Barcode': barcode,
                    'Company ID': company_id.toString(),
                    'Product List ID': product_list_id.toString()
                  };
                  
                  // Add to results array
                  results.push(refinedRow);
                  rowsAfterRefining++;
                  
                  callback(null);
                }
              });
              
              // Read and validate the CSV
              const csvStream = fs.createReadStream(localFilePath)
                .pipe(csvParser())
                .on('headers', (headers) => {
                  // Validate headers
                  const expectedHeaders = ['Product Name', 'Image Url', 'Brand', 'Barcode'];
                  const headersValid = expectedHeaders.every((header, index) => headers[index] === header);
                  
                  if (!headersValid) {
                    const errorMsg = `Invalid CSV headers. Expected: Product Name,Image Url,Brand,Barcode. Actual: ${headers.join(',')}`;
                    console.error('[ERROR]', errorMsg);
                    processingError = errorMsg;
                    csvStream.destroy(new Error(errorMsg));
                  } else {
                    headerValid = true;
                    console.log('[DEBUG] CSV headers validated successfully');
                  }
                });
              
              await pipeline(
                csvStream,
                validateRow
              ).catch((err) => {
                const errorMsg = `Error processing CSV: ${err.message}`;
                console.error('[ERROR]', errorMsg);
                processingError = processingError || errorMsg;
                
                // Clean up the file if it exists
                if (fs.existsSync(localFilePath)) {
                  try {
                    fs.unlinkSync(localFilePath);
                    console.log('[DEBUG] Cleaned up temporary file after error:', localFilePath);
                  } catch (cleanupErr) {
                    console.error('[ERROR] Failed to clean up temporary file:', cleanupErr);
                  }
                }
                
                throw err;
              });
              
              if (!headerValid) {
                console.error('[ERROR] CSV processing aborted due to invalid headers');
                processingError = processingError || 'CSV processing aborted due to invalid headers';
                
                // Update database with error
                await updateDatabase(pool, {
                  company_id,
                  product_list_id,
                  file_path: objectKey,
                  file_status: 'error',
                  total_batches: 0,
                  processed_batches: 0,
                  error: processingError
                });
                
                continue;
              }
              
              if (rowsAfterRefining === 0) {
                const errorMsg = `No valid rows found in the CSV file after refinement. Processed ${totalRowsProcessed} rows but all were invalid.`;
                console.error('[ERROR]', errorMsg);
                
                // Clean up local file
                if (fs.existsSync(localFilePath)) {
                  try {
                    fs.unlinkSync(localFilePath);
                    console.log('[DEBUG] Cleaned up original file after error');
                  } catch (cleanupErr) {
                    console.error('[ERROR] Failed to clean up original file:', cleanupErr);
                  }
                }
                
                // Update database with error
                await updateDatabase(pool, {
                  company_id,
                  product_list_id,
                  file_path: objectKey,
                  file_status: 'error',
                  total_batches: 0,
                  processed_batches: 0,
                  error: errorMsg
                });
                
                continue;
              }
              
              console.log('[DEBUG] CSV processing complete:', {
                totalRowsProcessed,
                rowsAfterRefining,
                uniqueBarcodes: barcodeSet.size
              });
              
              // Split the results into batches of 10,000 rows
              const batchSize = 10000;
              const batches = [];
              
              for (let i = 0; i < results.length; i += batchSize) {
                batches.push(results.slice(i, i + batchSize));
              }
              
              console.log('[DEBUG] Split data into', batches.length, 'batches');
              
              // Create a directory for batched files
              const batchedDir = path.join(tempDir, `${company_id}_${product_list_id}_batched`);
              if (!fs.existsSync(batchedDir)) {
                fs.mkdirSync(batchedDir, { recursive: true });
              }
              
              const batchedFilePaths = [];
              
              // Write batches to files on disk
              for (let i = 0; i < batches.length; i++) {
                const batchFileName = `batch_${i + 1}.csv`;
                const batchFilePath = path.join(batchedDir, batchFileName);
                
                try {
                  // Write batch to file without headers
                  let csvContent = '';
                  
                  batches[i].forEach(row => {
                    csvContent += `${row['Product Name']},${row['Image Url']},${row['Brand']},${row['Barcode']},${row['Company ID']},${row['Product List ID']}\n`;
                  });
                  
                  fs.writeFileSync(batchFilePath, csvContent);
                  batchedFilePaths.push(batchFilePath);
                  
                  console.log('[DEBUG] Created batch file:', {
                    batchNumber: i + 1,
                    rowCount: batches[i].length,
                    path: batchFilePath
                  });
                } catch (writeError) {
                  const errorMsg = `Failed to write batch file ${batchFileName}: ${writeError.message}`;
                  console.error('[ERROR]', errorMsg);
                  
                  // Clean up any created batch files
                  batchedFilePaths.forEach(filePath => {
                    try {
                      if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                      }
                    } catch (cleanupErr) {
                      console.error('[ERROR] Failed to clean up batch file:', cleanupErr);
                    }
                  });
                  
                  // Update database with error
                  await updateDatabase(pool, {
                    company_id,
                    product_list_id,
                    file_path: objectKey,
                    file_status: 'error',
                    total_batches: 0,
                    processed_batches: 0,
                    error: errorMsg
                  });
                  
                  throw writeError; // Re-throw to exit processing
                }
              }
              
              // Clean up original file
              fs.unlinkSync(localFilePath);
              
              // Update the database with batch information
              await updateDatabase(pool, {
                company_id,
                product_list_id,
                file_path: objectKey,
                batched_files_path: batchedDir,
                file_status: 'processing',
                total_batches: batches.length,
                processed_batches: 0,
                error: null
              });
              
              console.log('[DEBUG] Processing summary:', {
                company_id,
                product_list_id,
                totalRowsProcessed,
                rowsAfterRefining,
                batchesCreated: batches.length,
                batchedFilesDirectory: batchedDir
              });
              
              // Process each batch file and load into the products table
              try {
                await processBatchFiles(pool, {
                  company_id,
                  product_list_id,
                  batchedFilePaths,
                  batchedDir
                });
                
                // Update database with completion status
                await updateDatabase(pool, {
                  company_id,
                  product_list_id,
                  file_status: 'completed',
                  processed_batches: batches.length,
                  error: null
                });
                
                console.log('[DEBUG] All batches processed successfully:', {
                  company_id,
                  product_list_id,
                  totalBatches: batches.length
                });
              } catch (batchError) {
                const errorMsg = `Error processing batch files: ${batchError.message}`;
                console.error('[ERROR]', errorMsg);
                
                // Update database with error
                await updateDatabase(pool, {
                  company_id,
                  product_list_id,
                  file_status: 'error',
                  error: errorMsg
                });
              }
              
            } catch (processingErr) {
              console.error('[ERROR] Error during CSV processing:', processingErr);
              processingError = processingError || `Error during CSV processing: ${processingErr.message}`;
              
              // Update database with error
              await updateDatabase(pool, {
                company_id,
                product_list_id,
                file_path: objectKey,
                file_status: 'error',
                total_batches: 0,
                processed_batches: 0,
                error: processingError
              });
            }
          } catch (s3Error) {
            const errorMsg = `Failed to download file from S3: ${s3Error.message}`;
            console.error('[ERROR]', errorMsg);
            
            // Update database with error
            await updateDatabase(pool, {
              company_id,
              product_list_id,
              file_path: objectKey,
              file_status: 'error',
              total_batches: 0,
              processed_batches: 0,
              error: errorMsg
            });
            
            continue;
          }
        } else {
          console.log('[WARN] Message does not contain valid S3 event structure');
        }
      } catch (error) {
        console.error('[ERROR] Failed to parse or process message:', {
          error: error.message,
          stack: error.stack,
          messageId: record.messageId,
          body: record.body.substring(0, 200) + (record.body.length > 200 ? '...' : '') // Log first 200 chars
        });
      }
      
      console.log('[DEBUG] ------------ End of message processing ------------');
    }
    
    // Close the pool
    await pool.end();
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Successfully processed ${records.length} message(s)`
      })
    };
  } catch (error) {
    console.error('[ERROR] Critical failure in SQS message processing:', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Update the database with the file processing metadata
 */
async function updateDatabase(pool, data) {
  let client = null;
  
  try {
    // Try to get a client from the pool
    try {
      client = await pool.connect();
    } catch (connectionError) {
      console.error('[ERROR] Failed to get client from pool for database update:', {
        error: connectionError.message,
        code: connectionError.code,
        stack: connectionError.stack?.split('\n').slice(0, 3).join('\n')
      });
      
      // Log the data we were trying to update
      console.log('[INFO] Database update data that could not be saved:', JSON.stringify(data, null, 2));
      
      // Continue execution without throwing
      return null;
    }
    
    await client.query('BEGIN');
    console.log('[DEBUG] Started database transaction');
    
    const query = `
      INSERT INTO product_list_meta (
        company_id, 
        product_list_id, 
        file_path, 
        batched_files_path, 
        file_status, 
        total_batches, 
        processed_batches, 
        error, 
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT)
      ON CONFLICT (company_id, product_list_id) DO UPDATE SET
        file_path = COALESCE(EXCLUDED.file_path, product_list_meta.file_path),
        batched_files_path = COALESCE(EXCLUDED.batched_files_path, product_list_meta.batched_files_path),
        file_status = COALESCE(EXCLUDED.file_status, product_list_meta.file_status),
        total_batches = COALESCE(EXCLUDED.total_batches, product_list_meta.total_batches),
        processed_batches = COALESCE(EXCLUDED.processed_batches, product_list_meta.processed_batches),
        error = EXCLUDED.error,
        updated_at = EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT
      RETURNING *;
    `;
    
    // Create a values array with only the fields that are provided
    const values = [
      data.company_id,
      data.product_list_id,
      data.file_path,
      data.batched_files_path,
      data.file_status,
      data.total_batches !== undefined ? data.total_batches : null,
      data.processed_batches !== undefined ? data.processed_batches : null,
      data.error
    ];
    
    const result = await client.query(query, values);
    
    await client.query('COMMIT');
    console.log('[DEBUG] Database transaction committed');
    console.log('[DEBUG] Database updated successfully:', result.rows[0]);
    
    return result.rows[0];
  } catch (error) {
    console.error('[ERROR] Database update failed:', {
      error: error.message,
      code: error.code,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
      data: JSON.stringify(data)
    });
    
    // Try to rollback if possible
    if (client) {
      try {
        await client.query('ROLLBACK');
        console.error('[ERROR] Database transaction rolled back due to error');
      } catch (rollbackError) {
        console.error('[ERROR] Failed to rollback transaction:', rollbackError.message);
      }
    }
    
    return null;
  } finally {
    // Release client back to the pool if it exists
    if (client) {
      try {
        client.release();
        console.log('[DEBUG] Database client released');
      } catch (releaseError) {
        console.error('[ERROR] Failed to release client:', releaseError.message);
      }
    }
  }
}

/**
 * Process each batch file and load it into the products table using COPY command
 */
async function processBatchFiles(pool, data) {
  const { company_id, product_list_id, batchedFilePaths } = data;
  
  for (let i = 0; i < batchedFilePaths.length; i++) {
    const batchFilePath = batchedFilePaths[i];
    let client = null;
    
    try {
      console.log(`[DEBUG] Processing batch file ${i + 1}/${batchedFilePaths.length}: ${batchFilePath}`);
      
      // Try to get a client from the pool with retry
      try {
        client = await getClientWithRetry(pool, 3);
      } catch (connectionError) {
        console.error(`[ERROR] Failed to get database connection for batch ${i + 1}:`, {
          error: connectionError.message,
          code: connectionError.code
        });
        throw new Error(`Database connection failed for batch ${i + 1}: ${connectionError.message}`);
      }
      
      // Start a transaction
      await client.query('BEGIN');
      
      // Create a temporary table
      await client.query(`
        CREATE TEMP TABLE temp_products (
          name VARCHAR(255) NOT NULL,
          image_url VARCHAR(255),
          brand VARCHAR(255),
          barcode VARCHAR(255) NOT NULL,
          company_id INTEGER NOT NULL,
          product_list_id INTEGER NOT NULL
        ) ON COMMIT DROP;
      `);
      
      // Copy data from file to temp table
      const copyCommand = `
        COPY temp_products(name, image_url, brand, barcode, company_id, product_list_id) 
        FROM '${batchFilePath}' 
        WITH (FORMAT csv, DELIMITER ',');
      `;
      
      await client.query(copyCommand);
      
      // Insert data from temp table to products table
      const insertCommand = `
        INSERT INTO products (
          company_id, name, image_url, brand, barcode, product_list_id,
          has_image, is_ai_enriched, created_at, updated_at
        )
        SELECT
          company_id::integer, name, image_url, brand, barcode, product_list_id::integer,
          CASE WHEN image_url IS NOT NULL AND image_url != '' THEN true ELSE false END,
          false,
          EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT,
          EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT
        FROM temp_products
        ON CONFLICT (company_id, product_list_id, barcode) 
        DO UPDATE SET
          name = EXCLUDED.name,
          image_url = EXCLUDED.image_url,
          brand = EXCLUDED.brand,
          has_image = EXCLUDED.has_image,
          updated_at = EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT;
      `;
      
      await client.query(insertCommand);
      
      // Update processed_batches in product_list_meta
      const updateQuery = `
        UPDATE product_list_meta
        SET 
          processed_batches = processed_batches + 1,
          updated_at = EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT
        WHERE 
          company_id = $1 AND product_list_id = $2
        RETURNING *;
      `;
      
      const updateResult = await client.query(updateQuery, [company_id, product_list_id]);
      
      // Commit the transaction
      await client.query('COMMIT');
      
      console.log(`[DEBUG] Batch ${i + 1} processed successfully. Updated metadata:`, updateResult.rows[0]);
      
    } catch (error) {
      // Rollback the transaction on error if client exists
      if (client) {
        try {
          await client.query('ROLLBACK');
          console.error(`[ERROR] Transaction rolled back for batch ${i + 1}`);
        } catch (rollbackError) {
          console.error(`[ERROR] Failed to rollback transaction for batch ${i + 1}:`, rollbackError.message);
        }
      }
      
      console.error(`[ERROR] Failed to process batch ${i + 1}:`, {
        error: error.message,
        code: error.code,
        stack: error.stack?.split('\n').slice(0, 3).join('\n')
      });
      
      // Throw the error to stop processing further batches
      throw new Error(`Failed to process batch ${i + 1}: ${error.message}`);
    } finally {
      // Release client back to the pool if it exists
      if (client) {
        try {
          client.release();
          console.log(`[DEBUG] Database client released for batch ${i + 1}`);
        } catch (releaseError) {
          console.error(`[ERROR] Failed to release client for batch ${i + 1}:`, releaseError.message);
        }
      }
    }
  }
  
  console.log(`[DEBUG] All ${batchedFilePaths.length} batches processed successfully`);
}

/**
 * Get a client from the pool with retry logic
 */
async function getClientWithRetry(pool, maxRetries = 3, initialDelay = 1000) {
  let retries = 0;
  let lastError;
  
  while (retries < maxRetries) {
    try {
      console.log(`[DEBUG] Attempting to get client from pool (attempt ${retries + 1}/${maxRetries})...`);
      
      // Check if pool exists
      if (!pool) {
        throw new Error('Database pool is not initialized');
      }
      
      const client = await pool.connect();
      
      // Test connection with a simple query
      await client.query('SELECT 1');
      
      console.log(`[DEBUG] Successfully acquired client from pool after ${retries > 0 ? retries : 'no'} retries`);
      return client;
    } catch (error) {
      lastError = error;
      retries++;
      
      console.error(`[ERROR] Failed to get client from pool (attempt ${retries}/${maxRetries}):`, {
        error: error.message,
        code: error.code,
        stack: error.stack?.split('\n').slice(0, 3).join('\n')
      });
      
      if (retries >= maxRetries) {
        break;
      }
      
      // Exponential backoff
      const delay = initialDelay * Math.pow(2, retries - 1);
      console.log(`[DEBUG] Retrying to get client in ${delay} ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  console.error(`[ERROR] Failed to get client after ${maxRetries} attempts`);
  throw lastError;
}

/**
 * Create a database connection pool with retry logic
 */
async function createDatabasePoolWithRetry(Pool, dbConfig, maxRetries = 3, initialDelay = 1000) {
  let retries = 0;
  let lastError;
  
  while (retries < maxRetries) {
    try {
      console.log('[DEBUG] Creating database pool instance (attempt ' + (retries + 1) + '/' + maxRetries + ')');
      
      // Create the pool
      const pool = new Pool(dbConfig);
      
      // Test the connection by getting a client and releasing it
      console.log('[DEBUG] Testing database connection by acquiring a client...');
      const client = await pool.connect();
      
      // Verify connection works by performing a basic query
      console.log('[DEBUG] Testing query execution...');
      const testResult = await client.query('SELECT 1 as test');
      console.log('[DEBUG] Test query result:', testResult.rows[0]);
      
      client.release();
      
      console.log('[DEBUG] Successfully connected to the database after', retries > 0 ? `${retries} retries` : 'first attempt');
      return pool;
    } catch (error) {
      lastError = error;
      retries++;
      
      console.error('[ERROR] Failed to connect to database (attempt ' + retries + '/' + maxRetries + '):', {
        error: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint,
        stack: error.stack?.split('\n').slice(0, 3).join('\n')
      });
      
      if (retries >= maxRetries) {
        break;
      }
      
      // Exponential backoff
      const delay = initialDelay * Math.pow(2, retries - 1);
      console.log('[DEBUG] Retrying database connection in', delay, 'ms');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  console.error('[ERROR] Failed to establish database connection after', maxRetries, 'attempts');
  throw lastError;
} 