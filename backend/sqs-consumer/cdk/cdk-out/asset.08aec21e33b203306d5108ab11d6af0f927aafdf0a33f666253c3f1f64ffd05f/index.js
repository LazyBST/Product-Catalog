/**
 * Lambda function to consume messages from SQS queue and log the complete event body
 */

exports.handler = async (event) => {
  console.log('[DEBUG] Lambda invocation started with event:', JSON.stringify(event, null, 2));
  console.log('[DEBUG] Lambda function version:', process.env.AWS_LAMBDA_FUNCTION_VERSION);
  console.log('[DEBUG] Lambda function memory:', process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE);
  console.log('[DEBUG] Lambda function timeout:', process.env.AWS_LAMBDA_FUNCTION_TIMEOUT);
  
  // Import the AWS SDK at runtime - Node.js Lambda runtime has AWS SDK v3 available
  const { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3Client = new S3Client({ region: 'ap-south-1' });
  const fs = require('fs');
  const path = require('path');
  const csvParser = require('csv-parser');
  const { createObjectCsvWriter } = require('csv-writer');
  const { Transform } = require('stream');
  const { pipeline } = require('stream/promises');
  
  try {
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
            console.error('[ERROR] Invalid object key format. Expected format: company_id/product_list_id/filename.csv');
            continue;
          }
          
          const company_id = keyParts[0];
          const product_list_id = keyParts[1];
          
          console.log('[DEBUG] Extracted IDs:', {
            company_id,
            product_list_id
          });
          
          // Download the file from S3
          const getObjectParams = {
            Bucket: bucketName,
            Key: objectKey
          };
          
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
                'Company ID': company_id,
                'Product List ID': product_list_id
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
                console.error('[ERROR] Invalid CSV headers. Expected: Product Name,Image Url,Brand,Barcode');
                console.error('[ERROR] Actual headers:', headers);
                csvStream.destroy(new Error('Invalid CSV headers'));
              } else {
                headerValid = true;
                console.log('[DEBUG] CSV headers validated successfully');
              }
            });
          
          await pipeline(
            csvStream,
            validateRow
          ).catch((err) => {
            console.error('[ERROR] Error processing CSV:', err);
            throw err;
          });
          
          if (!headerValid) {
            console.error('[ERROR] CSV processing aborted due to invalid headers');
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
          
          // Write batches to files and upload to S3
          const destinationBucket = process.env.DESTINATION_BUCKET || 'batched-product-catalog-files';
          
          for (let i = 0; i < batches.length; i++) {
            const batchFileName = `batch_${i + 1}.csv`;
            const batchFilePath = path.join(tempDir, batchFileName);
            
            // Write batch to file without headers
            let csvContent = '';
            
            batches[i].forEach(row => {
              csvContent += `${row['Product Name']},${row['Image Url']},${row['Brand']},${row['Barcode']},${row['Company ID']},${row['Product List ID']}\n`;
            });
            
            fs.writeFileSync(batchFilePath, csvContent);
            
            // Upload file to S3
            const destinationKey = `${company_id}/${product_list_id}/batched/${batchFileName}`;
            
            await s3Client.send(new PutObjectCommand({
              Bucket: destinationBucket,
              Key: destinationKey,
              Body: fs.createReadStream(batchFilePath),
              ContentType: 'text/csv'
            }));
            
            console.log('[DEBUG] Uploaded batch file:', {
              batchNumber: i + 1,
              rowCount: batches[i].length,
              destination: `s3://${destinationBucket}/${destinationKey}`
            });
            
            // Clean up local file
            fs.unlinkSync(batchFilePath);
          }
          
          // Clean up original file
          fs.unlinkSync(localFilePath);
          
          console.log('[DEBUG] Processing summary:', {
            company_id,
            product_list_id,
            totalRowsProcessed,
            rowsAfterRefining,
            batchesCreated: batches.length
          });
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