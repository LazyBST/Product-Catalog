#!/bin/bash

# Exit on error
set -e

echo "=== Creating bcrypt Lambda Layer ==="

# Get the absolute path of the project directory
PROJECT_DIR="$(pwd)"
echo "Project directory: $PROJECT_DIR"

# Create layer directory structure
rm -rf bcrypt-layer
mkdir -p bcrypt-layer/nodejs

# Create a package.json for bcrypt
cat > bcrypt-layer/nodejs/package.json << EOF
{
  "name": "bcrypt-layer",
  "version": "1.0.0",
  "description": "Lambda Layer for bcrypt",
  "dependencies": {
    "bcrypt": "^5.1.1"
  }
}
EOF

# Check if Docker is available
if command -v docker &> /dev/null; then
    echo "Using Docker to build bcrypt for Lambda environment..."
    
    # Create Dockerfile for building bcrypt
    cat > bcrypt-layer/Dockerfile << EOF
FROM public.ecr.aws/lambda/nodejs:18

WORKDIR /var/task
COPY nodejs/package.json ./
RUN npm install
EOF

    # Build the Docker image
    (cd bcrypt-layer && docker build -t bcrypt-lambda-layer-builder .)
    
    # Run the container to extract the bcrypt module
    docker create --name bcrypt-layer-builder bcrypt-lambda-layer-builder
    
    # Extract the bcrypt module from the container
    rm -rf bcrypt-layer/nodejs/node_modules
    docker cp bcrypt-layer-builder:/var/task/node_modules bcrypt-layer/nodejs/
    
    # Clean up
    docker rm bcrypt-layer-builder
    rm bcrypt-layer/Dockerfile
else
    echo "Docker not available, trying npm install with platform flags..."
    cd bcrypt-layer/nodejs
    npm install --platform=linux --arch=x64 --production
    cd "$PROJECT_DIR"
fi

echo "=== bcrypt Lambda Layer Created ==="
echo "Layer is ready for deployment" 