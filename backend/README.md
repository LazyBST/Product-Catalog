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