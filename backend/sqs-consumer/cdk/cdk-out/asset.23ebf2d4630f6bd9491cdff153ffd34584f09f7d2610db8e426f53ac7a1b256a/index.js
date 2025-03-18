/**
 * Lambda function to consume messages from SQS queue and log the complete event body
 */
const AWS = require('aws-sdk/clients/s3');

// Initialize AWS clients
const s3 = new AWS();

exports.handler = async (event) => {
  console.log('[DEBUG] Lambda invocation started with event:', JSON.stringify(event, null, 2));
  console.log('[DEBUG] Lambda function version:', process.env.AWS_LAMBDA_FUNCTION_VERSION);
  console.log('[DEBUG] Lambda function memory:', process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE);
  console.log('[DEBUG] Lambda function timeout:', process.env.AWS_LAMBDA_FUNCTION_TIMEOUT);
  
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
          
          // Optionally get object metadata from S3
          try {
            const objectMetadata = await s3.headObject({
              Bucket: bucketName,
              Key: objectKey
            }).promise();
            
            console.log('[DEBUG] S3 object metadata:', {
              contentType: objectMetadata.ContentType,
              contentLength: objectMetadata.ContentLength,
              lastModified: objectMetadata.LastModified,
              metadata: objectMetadata.Metadata
            });
          } catch (error) {
            console.error('[ERROR] Failed to get S3 object metadata:', {
              error: error.message,
              stack: error.stack,
              bucket: bucketName,
              key: objectKey
            });
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