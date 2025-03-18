# AI-ventory Product Catalog

A full-stack application for managing product lists and inventory.

## Project Structure

The project consists of two main parts:

- **Frontend**: Next.js application with Material UI
- **Backend**: Express.js API with PostgreSQL database

## Setup Instructions

### Backend Setup

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start PostgreSQL using Docker:
   ```
   docker-compose up -d
   ```

4. Run the migration script to set up the database:
   ```
   npm run init-db
   ```

5. Start the backend server:
   ```
   npm run dev
   ```

The backend API will be available at http://localhost:5006

### Frontend Setup

1. Navigate to the frontend directory:
   ```
   cd frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm run dev
   ```

The frontend application will be available at http://localhost:3000

## Features

- Dashboard page with lists of products
- Add new product lists with a simple interface
- View pipeline data for processing batches
- Upload files with size limits and validation

## API Endpoints

- `GET /api/product-list` - Fetch all product lists
- `POST /api/product-list` - Create a new product list
- `GET /api/product-list/pipeline` - Fetch pipeline data

All API responses follow this structure:
```json
{
  "success": true,
  "data": [...],
  "errMsg": null
}
``` 