import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { Construct } from 'constructs';

export class ExpressLambdaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda function
    const expressLambda = new lambda.Function(this, 'ExpressLambdaFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda-package')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 1024,
      environment: {
        NODE_ENV: 'production',
        MY_AWS_REGION: process.env.MY_AWS_REGION || 'ap-south-1',
        MY_AWS_ACCESS_KEY_ID: process.env.MY_AWS_ACCESS_KEY_ID || '',
        MY_AWS_SECRET_ACCESS_KEY: process.env.MY_AWS_SECRET_ACCESS_KEY || '',
        MY_S3_BUCKET_NAME: process.env.MY_S3_BUCKET_NAME || '',
        // Database env vars
        DB_HOST: process.env.DB_HOST || '',
        DB_PORT: process.env.DB_PORT || '5434',
        DB_USER: process.env.DB_USER || '',
        DB_PASSWORD: process.env.DB_PASSWORD || '',
        DB_NAME: process.env.DB_NAME || '',
        // API config
        PORT: process.env.PORT || '5006',
        // JWT config
        JWT_SECRET: process.env.JWT_SECRET || '',
        // OpenAI config
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || ''
      }
    });

    // Grant necessary permissions to the Lambda function
    expressLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents'
        ],
        resources: ['arn:aws:logs:*:*:*']
      })
    );

    // Add S3 permissions
    expressLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:ListBucket'
        ],
        resources: [
          `arn:aws:s3:::${process.env.MY_S3_BUCKET_NAME || 'dev-product-catalog-files'}`,
          `arn:aws:s3:::${process.env.MY_S3_BUCKET_NAME || 'dev-product-catalog-files'}/*`
        ]
      })
    );

    // Create API Gateway
    const api = new apigateway.RestApi(this, 'ExpressAPI', {
      restApiName: 'Express API Service',
      description: 'Express app API Gateway',
      deployOptions: {
        stageName: 'prod',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token'
        ]
      }
    });

    // Connect API Gateway to Lambda function
    const lambdaIntegration = new apigateway.LambdaIntegration(expressLambda, {
      proxy: true
    });

    // Add proxy resource to route all requests to Lambda
    const proxyResource = api.root.addProxy({
      defaultIntegration: lambdaIntegration,
      anyMethod: true
    });

    // Output API Gateway URL
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'URL of the API Gateway'
    });
  }
} 