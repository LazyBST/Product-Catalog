/**
 * Lambda function to consume messages from SQS queue and log the complete event body
 */

exports.handler = async (event) => {
  console.log('[DEBUG] Lambda invocation started with event:', JSON.stringify(event, null, 2));
  console.log('[DEBUG] Lambda function version:', process.env.AWS_LAMBDA_FUNCTION_VERSION);
  console.log('[DEBUG] Lambda function memory:', process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE);
  console.log('[DEBUG] Lambda function timeout:', process.env.AWS_LAMBDA_FUNCTION_TIMEOUT);
  
  // Diagnostic: Check for VPC configuration and network interfaces
  try {
    const { networkInterfaces } = require('os');
    const interfaces = networkInterfaces();
    console.log('[DEBUG] Network interfaces:', JSON.stringify(interfaces));
    
    // Check if Lambda is in a VPC by looking for network interfaces other than localhost
    const isInVpc = Object.values(interfaces).some(iface => 
      iface.some(addr => !addr.internal && addr.family === 'IPv4')
    );
    
    console.log(`[DEBUG] Lambda is ${isInVpc ? 'running in a VPC' : 'not in a VPC'}`);
    
    // Test internet connectivity - this should work regardless of VPC setup
    try {
      const https = require('https');
      await new Promise((resolve, reject) => {
        const req = https.get('https://api.ipify.org', (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            console.log('[DEBUG] Internet connectivity test successful, public IP:', data);
            resolve(data);
          });
        });
        req.on('error', (e) => {
          console.error('[ERROR] Internet connectivity test failed:', e.message);
          reject(e);
        });
        req.setTimeout(5000, () => {
          console.error('[ERROR] Internet connectivity test timed out after 5s');
          req.destroy(new Error('Timeout'));
          reject(new Error('Internet connectivity test timed out'));
        });
      });
    } catch (netError) {
      console.error('[ERROR] Internet connectivity test failed:', netError);
    }
  } catch (diagError) {
    console.error('[ERROR] Diagnostic check failed:', diagError);
  }
  
  // Add custom agent settings to improve socket usage
  process.env.AWS_NODEJS_CONNECTION_REUSE_ENABLED = '1';

  const fs = require('fs');
  const path = require('path');
  const csvParser = require('csv-parser');
  const { Transform } = require('stream');
  const { pipeline } = require('stream/promises');
  const { Pool } = require('pg');
  
  // Test direct S3 connection with both regular and headless operations
  try {
    console.log('[DEBUG] Testing S3 connectivity with HeadBucket operation...');
    const { S3Client, HeadBucketCommand, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    
    // Create test client with shorter timeouts for diagnostics
    const testS3Client = new S3Client({
      region: 'ap-south-1',
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 5000,
        socketTimeout: 5000,
      })
    });
    
    // Check if bucket exists (HeadBucket is lightweight)
    try {
      const headBucketResult = await testS3Client.send(
        new HeadBucketCommand({ Bucket: 'dev-product-catalog-files' })
      );
      console.log('[DEBUG] HeadBucket successful:', JSON.stringify(headBucketResult.$metadata));
    } catch (headErr) {
      console.error('[ERROR] HeadBucket failed:', {
        error: headErr.message,
        code: headErr.name,
        requestId: headErr.$metadata?.requestId,
      });
    }
    
    // Try listing a few objects (more diagnostic info)
    try {
      console.log('[DEBUG] Testing S3 listing...');
      const listResult = await testS3Client.send(
        new ListObjectsV2Command({ 
          Bucket: 'dev-product-catalog-files',
          MaxKeys: 3
        })
      );
      console.log('[DEBUG] ListObjectsV2 successful, found', 
        listResult.Contents?.length || 0, 'objects');
    } catch (listErr) {
      console.error('[ERROR] ListObjectsV2 failed:', {
        error: listErr.message,
        code: listErr.name,
        requestId: listErr.$metadata?.requestId,
      });
    }
  } catch (testError) {
    console.error('[ERROR] S3 diagnostic tests failed:', testError);
  }
  
  // Initialize the pool directly with fallback values
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'product_catalog',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  // Test connection using callback pattern
  pool.connect((err, client, release) => {
    if (err) {
      console.error('Database connection error:', err.message);
      console.error('Database config:', {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER || 'postgres',
        database: process.env.DB_NAME || 'product_catalog',
      });
    } else {
      console.log('Successfully connected to the database');
      release();
    }
  });

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('Unexpected error on idle database client', err);
    // Note: I'm not including process.exit(-1) here as it would terminate the Lambda
    // which is likely not desired behavior in a serverless environment
  });

  // Create a simpler interface for running queries
  const query = (text, params) => pool.query(text, params);
  
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
          query('INSERT INTO product_list_meta (company_id, product_list_id, file_path, file_status, total_batches, processed_batches, error) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT ON CONSTRAINT product_list_meta_pkey DO UPDATE SET file_path = EXCLUDED.file_path, file_status = EXCLUDED.file_status, total_batches = EXCLUDED.total_batches, processed_batches = EXCLUDED.processed_batches, error = EXCLUDED.error', [0, 0, objectKey, 'completed', 0, 0, errorMsg]);
          
          continue;
        }
        
        const company_id = parseInt(keyParts[0], 10);
        const product_list_id = parseInt(keyParts[1], 10);
        
        if (isNaN(company_id) || isNaN(product_list_id)) {
          const errorMsg = 'Invalid company_id or product_list_id in object key. Both should be numeric.';
          console.error('[ERROR]', errorMsg);
          
          // Update database with error
          query('INSERT INTO product_list_meta (company_id, product_list_id, file_path, file_status, total_batches, processed_batches, error) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT ON CONSTRAINT product_list_meta_pkey DO UPDATE SET file_path = EXCLUDED.file_path, file_status = EXCLUDED.file_status, total_batches = EXCLUDED.total_batches, processed_batches = EXCLUDED.processed_batches, error = EXCLUDED.error', [isNaN(company_id) ? 0 : company_id, isNaN(product_list_id) ? 0 : product_list_id, objectKey, 'completed', 0, 0, errorMsg]);
          
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
          console.log('[DEBUG] Downloading file from S3:', {
            bucket: bucketName,
            key: objectKey,
            maxAttempts: s3Client.config.maxAttempts
          });
          
          // Implement custom retry logic for the GetObject operation
          let retries = 0;
          const maxRetries = 5; // Increased from 3 to 5
          let getObjectResponse;
          
          while (retries <= maxRetries) {
            try {
              if (retries > 0) {
                console.log(`[DEBUG] S3 download retry attempt ${retries}/${maxRetries}`);
                // Exponential backoff with jitter
                const delay = Math.floor(Math.random() * (2000 * Math.pow(2, retries))); // Increased base delay from 1000 to 2000
                console.log(`[DEBUG] Waiting ${delay}ms before retry ${retries}`);
                await new Promise(resolve => setTimeout(resolve, delay));
              }
              
              // Log network status before attempting download
              console.log(`[DEBUG] Network status before S3 download attempt ${retries + 1}:`, {
                memory: process.memoryUsage(),
                connections: 'Attempting connection to S3'
              });
              
              getObjectResponse = await s3Client.send(new GetObjectCommand(getObjectParams));
              console.log('[DEBUG] S3 download successful');
              break; // Success, exit the loop
            } catch (retryError) {
              retries++;
              
              // Log details about the specific error
              console.error(`[ERROR] S3 download attempt ${retries} failed:`, {
                error: retryError.message,
                code: retryError.code,
                requestId: retryError.$metadata?.requestId,
                cfId: retryError.$metadata?.cfId,
                attempt: retries,
                errorType: retryError.constructor.name,
                stack: retryError.stack?.split('\n').slice(0, 3).join('\n')
              });
              
              // If we've reached max retries, rethrow the error
              if (retries > maxRetries) {
                console.error('[ERROR] Max retries reached for S3 download, giving up');
                throw retryError;
              }
              
              // More permissive retry condition - retry on most errors except permission issues
              if (retryError.name === 'AccessDenied' || 
                  retryError.message.includes('Access Denied')) {
                console.error('[ERROR] S3 access denied, not retrying');
                throw retryError; // Don't retry permission errors
              }
            }
          }
          
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
              query('INSERT INTO product_list_meta (company_id, product_list_id, file_path, file_status, total_batches, processed_batches, error) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT ON CONSTRAINT product_list_meta_pkey DO UPDATE SET file_path = EXCLUDED.file_path, file_status = EXCLUDED.file_status, total_batches = EXCLUDED.total_batches, processed_batches = EXCLUDED.processed_batches, error = EXCLUDED.error', [company_id, product_list_id, objectKey, 'completed', 0, 0, processingError]);
              
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
              query('INSERT INTO product_list_meta (company_id, product_list_id, file_path, file_status, total_batches, processed_batches, error) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT ON CONSTRAINT product_list_meta_pkey DO UPDATE SET file_path = EXCLUDED.file_path, file_status = EXCLUDED.file_status, total_batches = EXCLUDED.total_batches, processed_batches = EXCLUDED.processed_batches, error = EXCLUDED.error', [company_id, product_list_id, objectKey, 'completed', 0, 0, errorMsg]);
              
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
                query('INSERT INTO product_list_meta (company_id, product_list_id, file_path, file_status, total_batches, processed_batches, error) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT ON CONSTRAINT product_list_meta_pkey DO UPDATE SET file_path = EXCLUDED.file_path, file_status = EXCLUDED.file_status, total_batches = EXCLUDED.total_batches, processed_batches = EXCLUDED.processed_batches, error = EXCLUDED.error', [company_id, product_list_id, objectKey, 'completed', 0, 0, errorMsg]);
                
                throw writeError; // Re-throw to exit processing
              }
            }
            
            // Clean up original file
            fs.unlinkSync(localFilePath);
            
            // Update the database with batch information
            query('INSERT INTO product_list_meta (company_id, product_list_id, file_path, batched_files_path, file_status, total_batches, processed_batches, error) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT ON CONSTRAINT product_list_meta_pkey DO UPDATE SET file_path = EXCLUDED.file_path, batched_files_path = EXCLUDED.batched_files_path, file_status = EXCLUDED.file_status, total_batches = EXCLUDED.total_batches, processed_batches = EXCLUDED.processed_batches, error = EXCLUDED.error', [company_id, product_list_id, objectKey, batchedDir, 'processing', batches.length, 0, null]);
            
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
              query('UPDATE product_list_meta SET processed_batches = $1, updated_at = EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT WHERE company_id = $2 AND product_list_id = $3', [batches.length, company_id, product_list_id]);
              
              console.log('[DEBUG] All batches processed successfully:', {
                company_id,
                product_list_id,
                totalBatches: batches.length
              });
            } catch (batchError) {
              const errorMsg = `Error processing batch files: ${batchError.message}`;
              console.error('[ERROR]', errorMsg);
              
              // Update database with error
              query('UPDATE product_list_meta SET processed_batches = $1, error = $2 WHERE company_id = $3 AND product_list_id = $4', [0, errorMsg, company_id, product_list_id]);
            }
            
          } catch (processingErr) {
            console.error('[ERROR] Error during CSV processing:', processingErr);
            processingError = processingError || `Error during CSV processing: ${processingErr.message}`;
            
            // Update database with error
            query('UPDATE product_list_meta SET processed_batches = $1, error = $2 WHERE company_id = $3 AND product_list_id = $4', [0, processingError, company_id, product_list_id]);
          }
        } catch (s3Error) {
          const errorMsg = `Failed to download file from S3: ${s3Error.message}`;
          console.error('[ERROR]', errorMsg);
          
          // Update database with error
          query('UPDATE product_list_meta SET processed_batches = $1, error = $2 WHERE company_id = $3 AND product_list_id = $4', [0, errorMsg, company_id, product_list_id]);
          
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
  pool.end();
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Successfully processed ${records.length} message(s)`
    })
  };
};

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
        ON CONFLICT ON CONSTRAINT products_company_id_product_list_id_barcode_key
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