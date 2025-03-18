# AI-ventory Backend

This is the Express.js backend for the AI-ventory application. It provides APIs for managing product lists and related data.

## Prerequisites

- Node.js (v14+)
- PostgreSQL (running on port 5434)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file with the following variables:
   ```
   PORT=5006
   DB_HOST=localhost
   DB_PORT=5434
   DB_USER=postgres
   DB_PASSWORD=postgres
   DB_NAME=product_catalog
   ```

3. Start PostgreSQL using Docker Compose:
   ```bash
   docker-compose up -d
   ```

4. Run database migrations:
   ```bash
   npm run init-db
   ```

5. Start the server:
   ```bash
   npm run dev
   ```

## API Endpoints

### Product List

- `GET /api/product-list` - Get all product lists
- `GET /api/product-list/pipeline` - Get product list pipeline data

### File Upload

- `GET /api/product-list/upload/presigned-url` - Get a presigned URL for direct upload to S3
  - Query parameters:
    - `productListId` - ID of the product list
    - `fileName` - Name of the file to upload
  - Requires authentication

- `GET /api/product-list/upload/sample` - Download a sample CSV file with headers
  - No authentication required

## Response Format

All API responses follow this structure:
```json
{
  "success": true,
  "data": [...],
  "errMsg": null
}
```

- `success`: Boolean indicating if the request was successful
- `data`: The requested data (null if error)
- `errMsg`: Error message (null if successful)

### Environment Variables

Make sure to set these additional environment variables for S3 integration:

- `MY_AWS_ACCESS_KEY_ID` - AWS access key ID
- `MY_AWS_SECRET_ACCESS_KEY` - AWS secret access key
- `MY_AWS_REGION` - AWS region (defaults to 'us-east-1')
- `MY_S3_BUCKET_NAME` - S3 bucket name for file uploads 






{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Action": [
				"sqs:ReceiveMessage",
				"sqs:ChangeMessageVisibility",
				"sqs:GetQueueUrl",
				"sqs:DeleteMessage",
				"sqs:GetQueueAttributes"
			],
			"Resource": "arn:aws:sqs:ap-south-1:869935084697:FileUploadQueue",
			"Effect": "Allow"
		},
		{
			"Action": [
				"s3:GetObject",
				"s3:HeadObject",
				"s3:ListBucket"
			],
			"Resource": [
				"arn:aws:s3:::dev-product-catalog-files",
				"arn:aws:s3:::dev-product-catalog-files/*"
			],
			"Effect": "Allow"
		},
		{
			"Action": [
				"s3:PutObject",
				"s3:PutObjectAcl",
				"s3:ListBucket"
			],
			"Resource": [
				"arn:aws:s3:::batched-product-catalog-files",
				"arn:aws:s3:::batched-product-catalog-files/*"
			],
			"Effect": "Allow"
		}
	]
}