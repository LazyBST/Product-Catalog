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
        `${s3SourceBucketArn}/*`
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
        `${s3DestinationBucketArn}/*`
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
