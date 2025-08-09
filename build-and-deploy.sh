#!/bin/bash

# Build and Deploy Script for User Management System
# This script compiles TypeScript and deploys the SAM application

set -e  # Exit on any error

echo "🔨 Building TypeScript..."
cd src
npm run build
cd ..

echo "🚀 Deploying SAM application..."
sam deploy

echo "✅ Build and deployment complete!"

echo "📋 Getting API endpoints..."
echo "Login API: $(aws cloudformation describe-stacks --stack-name user-management-system --query "Stacks[0].Outputs[?OutputKey=='LoginApi'].OutputValue" --output text)"
echo "Create User API: $(aws cloudformation describe-stacks --stack-name user-management-system --query "Stacks[0].Outputs[?OutputKey=='CreateUserApi'].OutputValue" --output text)"
echo "List Users API: $(aws cloudformation describe-stacks --stack-name user-management-system --query "Stacks[0].Outputs[?OutputKey=='ListUsersApi'].OutputValue" --output text)"
echo "Get User Info API: $(aws cloudformation describe-stacks --stack-name user-management-system --query "Stacks[0].Outputs[?OutputKey=='GetUserInfoApi'].OutputValue" --output text)"
echo "User Pool ID: $(aws cloudformation describe-stacks --stack-name user-management-system --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)"
