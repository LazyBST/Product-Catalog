# Express App CDK Deployment

This directory contains an AWS CDK project for deploying the Express.js application to AWS Lambda and API Gateway.

## Prerequisites

- AWS CLI installed and configured
- Node.js 18.x or later
- NPM 8.x or later
- AWS CDK v2 installed (`npm install -g aws-cdk`)

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Bootstrap CDK in your AWS account (if not already done):
   ```
   cdk bootstrap
   ```

3. Build the TypeScript files:
   ```
   npm run build
   ```

## Deployment

To deploy the Express app to AWS Lambda:

```
cdk deploy
```

The deployment will output the API Gateway URL where your Express app is accessible.

## Configuration

The deployment stack is defined in `lib/express-lambda-stack.ts`. You can modify this file to:

- Change Lambda function configuration (memory, timeout)
- Add environment variables
- Configure API Gateway settings
- Add database access permissions
- Set up additional AWS resources

## Clean Up

To remove the deployed resources:

```
cdk destroy
```

## Structure

- `bin/app.ts` - CDK app entry point
- `lib/express-lambda-stack.ts` - Main stack definition
- `cdk.json` - CDK configuration
- `tsconfig.json` - TypeScript configuration 