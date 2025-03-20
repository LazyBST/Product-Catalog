# SQS Consumer Lambda

Lambda function that consumes messages from an SQS queue, processes S3 events contained in those messages, and retrieves object metadata.

## Project Structure

```
.
├── src/                   # Source code for Lambda function
│   └── index.js           # Main Lambda handler
├── cdk/                   # AWS CDK infrastructure as code
│   └── src/               # TypeScript source for CDK
│       └── stack.ts       # CDK stack definition
├── deploy.sh              # Deployment script
└── package.json           # Project dependencies
```

## Deployment

To deploy the Lambda function:

```bash
./deploy.sh
```

## Dependencies

- AWS SDK: For interacting with AWS services
- AWS CDK: For defining and deploying infrastructure 


r03bSjwTpmvTdj7gNNpT
my-vpc-fixed-cluster.cluster-ctwc6g2wmko3.ap-south-1.rds.amazonaws.com