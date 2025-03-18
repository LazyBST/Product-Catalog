#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ExpressLambdaStack } from '../lib/express-lambda-stack';

const app = new cdk.App();
new ExpressLambdaStack(app, 'ExpressLambdaStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  },
  description: 'Express app deployed to AWS Lambda'
}); 