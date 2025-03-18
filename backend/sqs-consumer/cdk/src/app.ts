#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SqsConsumerStack } from './stack';

const app = new cdk.App();
new SqsConsumerStack(app, 'SqsConsumerStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION || 'ap-south-1'
  },
  description: 'SQS Consumer Lambda Function'
}); 