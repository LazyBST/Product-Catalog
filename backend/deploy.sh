#!/bin/bash

# Exit on error
set -e

echo "=== Express App Lambda Deployment ==="

# Get the absolute path of the project directory
PROJECT_DIR="$(pwd)"
echo "Project directory: $PROJECT_DIR"

# Install dependencies for main project
echo "Installing dependencies for Express app..."
npm install

# Create deployment package directory
echo "Creating deployment package..."
rm -rf lambda-package
mkdir -p lambda-package
cp -r src index.js package.json lambda-package/

# Create utils directory if it doesn't exist
mkdir -p lambda-package/src/utils

# Copy .env file if it exists
if [ -f .env ]; then
  cp .env lambda-package/
fi

# Update package.json to use bcryptjs instead of bcrypt
echo "Updating package.json to use bcryptjs..."
cd lambda-package
if [ -f "package.json" ]; then
  # Replace bcrypt with bcryptjs in package.json
  node -e "
    const pkg = require('./package.json');
    if (pkg.dependencies && pkg.dependencies.bcrypt) {
      delete pkg.dependencies.bcrypt;
      pkg.dependencies.bcryptjs = '^2.4.3';
      require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2));
      console.log('Updated package.json to use bcryptjs');
    } else if (pkg.dependencies && pkg.dependencies.bcryptjs) {
      console.log('package.json already uses bcryptjs');
    } else {
      console.log('bcrypt not found in package.json');
    }
  "
fi

# Install production dependencies
echo "Installing production dependencies..."
npm install --production

cd "$PROJECT_DIR"

# Verify lambda-package exists and is populated
echo "Verifying lambda-package directory..."
ls -la lambda-package
echo "Verify node_modules contains bcryptjs:"
ls -la lambda-package/node_modules/bcryptjs 2>/dev/null || echo "bcryptjs module not found"

# Install dependencies for CDK project
echo "Installing dependencies for CDK project..."
cd cdk && npm install && cd "$PROJECT_DIR"

# Check if we need to bootstrap CDK
if [ "$1" == "bootstrap" ]; then
  echo "Bootstrapping CDK..."
  npm run cdk:bootstrap
  exit 0
fi

# Build the CDK project
echo "Building CDK project..."
cd cdk && npm run build && cd "$PROJECT_DIR"

# Deploy
echo "Deploying..."
cd cdk && cdk deploy && cd "$PROJECT_DIR"

echo "=== Deployment Complete ==="
echo "Check the AWS Console or CDK output for your API Gateway URL" 