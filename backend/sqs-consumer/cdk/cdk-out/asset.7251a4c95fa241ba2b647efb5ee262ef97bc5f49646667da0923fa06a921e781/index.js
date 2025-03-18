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
  const { Client } = require('pg');
  
  try {
    // Get database credentials from environment variables
    const dbConfig = {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    };
    
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
            await updateDatabase(dbConfig, {
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
            await updateDatabase(dbConfig, {
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
                await updateDatabase(dbConfig, {
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
                await updateDatabase(dbConfig, {
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
                  await updateDatabase(dbConfig, {
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
              await updateDatabase(dbConfig, {
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
              
            } catch (processingErr) {
              console.error('[ERROR] Error during CSV processing:', processingErr);
              processingError = processingError || `Error during CSV processing: ${processingErr.message}`;
              
              // Update database with error
              await updateDatabase(dbConfig, {
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
            await updateDatabase(dbConfig, {
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
async function updateDatabase(dbConfig, data) {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('[DEBUG] Connected to PostgreSQL database');
    
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
        file_path = EXCLUDED.file_path,
        batched_files_path = EXCLUDED.batched_files_path,
        file_status = EXCLUDED.file_status,
        total_batches = EXCLUDED.total_batches,
        processed_batches = EXCLUDED.processed_batches,
        error = EXCLUDED.error,
        updated_at = EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT
      RETURNING *;
    `;
    
    const values = [
      data.company_id,
      data.product_list_id,
      data.file_path,
      data.batched_files_path || null,
      data.file_status,
      data.total_batches,
      data.processed_batches,
      data.error
    ];
    
    const result = await client.query(query, values);
    
    console.log('[DEBUG] Database updated successfully:', result.rows[0]);
    
    return result.rows[0];
  } catch (error) {
    console.error('[ERROR] Failed to update database:', error);
    // We're not re-throwing the error so the Lambda can continue processing
    // even if database updates fail
    return null;
  } finally {
    try {
      await client.end();
      console.log('[DEBUG] Database connection closed');
    } catch (closeError) {
      console.error('[ERROR] Failed to close database connection:', closeError);
    }
  }
} 