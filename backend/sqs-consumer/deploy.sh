#!/bin/bash

# Exit on error
set -e

echo "=== SQS Consumer Lambda Deployment ==="

# Get the absolute path of the project directory
PROJECT_DIR="$(pwd)"
echo "Project directory: $PROJECT_DIR"

# Ensure source directory exists
if [ ! -f "${PROJECT_DIR}/src/index.js" ]; then
  echo "ERROR: Source file ${PROJECT_DIR}/src/index.js does not exist!"
  exit 1
fi

# Create a clean deployment directory
echo "Creating clean deployment package..."
DEPLOY_DIR="${PROJECT_DIR}/deploy"
mkdir -p "$DEPLOY_DIR"
rm -rf "$DEPLOY_DIR"/*

# Copy only the necessary files
echo "Copying Lambda function code..."
cp "${PROJECT_DIR}/src/index.js" "$DEPLOY_DIR/"

# Create a minimal package.json for Lambda
echo "Creating minimal package.json..."
cat > "$DEPLOY_DIR/package.json" << 'EOF'
{
  "name": "sqs-consumer",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "csv-parser": "^3.0.0",
    "csv-writer": "^1.6.0",
    "pg": "^8.11.3"
  }
}
EOF

# Install only the essential dependencies
echo "Installing minimal dependencies for Lambda function..."
cd "$DEPLOY_DIR" && npm install --production --no-package-lock

# Verify that the deployment directory is set up correctly
echo "Verifying deployment package..."
if [ ! -f "$DEPLOY_DIR/index.js" ]; then
  echo "ERROR: Failed to create valid deployment package!"
  exit 1
fi

# Create temporary stack file
TEMP_STACK_FILE="${PROJECT_DIR}/cdk/src/stack.ts.new"

# Update the CDK stack to use the new deployment directory
echo "Updating CDK stack to use the clean deployment package..."
cat > "$TEMP_STACK_FILE" << EOF
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as path from 'path';
import { Construct } from 'constructs';

export class SqsConsumerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import existing SQS queue
    const fileUploadQueue = sqs.Queue.fromQueueArn(
      this,
      'ImportedFileUploadQueue',
      'arn:aws:sqs:ap-south-1:869935084697:FileUploadQueue'
    );

    // Create Lambda function with clean deployment package 
    const sqsConsumerFunction = new lambda.Function(this, 'SqsConsumerFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../..', 'deploy')),
      timeout: cdk.Duration.seconds(300), // Increased timeout for processing large files
      memorySize: 512, // Increased memory for processing large files
      environment: {
        NODE_ENV: 'production',
        DESTINATION_BUCKET: 'batched-product-catalog-files'
      }
    });

    // Add SQS event source to Lambda
    sqsConsumerFunction.addEventSource(new lambdaEventSources.SqsEventSource(fileUploadQueue, {
      batchSize: 1, // Process messages one at a time
      enabled: true
    }));

    // Grant Lambda permission to read from SQS queue
    fileUploadQueue.grantConsumeMessages(sqsConsumerFunction);

    // Define source S3 bucket ARN
    const s3SourceBucketArn = 'arn:aws:s3:::dev-product-catalog-files';
    
    // Define destination S3 bucket ARN
    const s3DestinationBucketArn = 'arn:aws:s3:::batched-product-catalog-files';

    // Grant Lambda permissions to read from source S3 bucket
    const s3SourceBucketPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:HeadObject',
        's3:ListBucket'
      ],
      resources: [
        s3SourceBucketArn,
        \`\${s3SourceBucketArn}/*\`
      ]
    });
    sqsConsumerFunction.addToRolePolicy(s3SourceBucketPolicy);

    // Grant Lambda permissions to write to destination S3 bucket
    const s3DestinationBucketPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:PutObject',
        's3:PutObjectAcl',
        's3:ListBucket'
      ],
      resources: [
        s3DestinationBucketArn,
        \`\${s3DestinationBucketArn}/*\`
      ]
    });
    sqsConsumerFunction.addToRolePolicy(s3DestinationBucketPolicy);

    // Output the Lambda function ARN
    new cdk.CfnOutput(this, 'SqsConsumerFunctionArn', {
      value: sqsConsumerFunction.functionArn,
      description: 'ARN of the SQS Consumer Lambda Function'
    });
  }
}
EOF

# Move the stack file into place
mv "$TEMP_STACK_FILE" "${PROJECT_DIR}/cdk/src/stack.ts"

# Verify stack file was created successfully
if [ ! -f "${PROJECT_DIR}/cdk/src/stack.ts" ]; then
  echo "ERROR: Failed to update stack file!"
  exit 1
fi

# Show directory structure for debugging
echo "Directory structure for debugging:"
find "$PROJECT_DIR" -type d -maxdepth 2

# Install dependencies for CDK project
echo "Installing dependencies for CDK project..."
cd "${PROJECT_DIR}/cdk" && npm install

# Build the CDK project
echo "Building CDK project..."
npm run build

# Validate the CDK project built successfully
if [ ! -f "${PROJECT_DIR}/cdk/lib/stack.js" ] && [ ! -f "${PROJECT_DIR}/cdk/dist/stack.js" ]; then
  echo "WARNING: CDK build output not found at expected location. This may be normal if your build output directory is configured differently."
fi

# Check if we need to bootstrap CDK
if [ "$1" == "bootstrap" ]; then
  echo "Bootstrapping CDK..."
  npm run bootstrap
  exit 0
fi

# Deploy the CDK stack
echo "Deploying CDK stack..."
npm run deploy

echo "=== Deployment Complete ===" 