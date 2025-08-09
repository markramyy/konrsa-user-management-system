#!/bin/bash

# Build and Deploy Script for User Management System
# This script compiles TypeScript and deploys the SAM application

# Check if this is the first deployment
DEPLOYMENT_CONFIG_FILE=".deployment-config"
IS_FIRST_DEPLOYMENT=true

if [[ -f "$DEPLOYMENT_CONFIG_FILE" ]]; then
    IS_FIRST_DEPLOYMENT=false
    echo "📋 Detected previous deployment configuration"
else
    echo "🆕 First-time deployment detected"
fi

echo "🔨 Building TypeScript..."
cd src
npm run build
cd ..

echo "🔍 Validating SAM template..."
sam validate

echo "🔧 Building SAM application..."
sam build

echo "🚀 Deploying SAM application..."
if [[ "$IS_FIRST_DEPLOYMENT" == "true" ]]; then
    echo "   Running guided deployment (first time)..."
    sam deploy --guided
    # Create deployment config file after successful deployment
    echo "DEPLOYMENT_DATE=$(date)" > "$DEPLOYMENT_CONFIG_FILE"
    echo "STACK_NAME=user-management-system" >> "$DEPLOYMENT_CONFIG_FILE"
else
    echo "   Running standard deployment (using existing configuration)..."
    sam deploy
fi

echo "✅ Build and deployment complete!"

echo "📋 Getting API endpoints..."
LOGIN_API=$(aws cloudformation describe-stacks --stack-name user-management-system --query "Stacks[0].Outputs[?OutputKey=='LoginApi'].OutputValue" --output text)
CREATE_USER_API=$(aws cloudformation describe-stacks --stack-name user-management-system --query "Stacks[0].Outputs[?OutputKey=='CreateUserApi'].OutputValue" --output text)
LIST_USERS_API=$(aws cloudformation describe-stacks --stack-name user-management-system --query "Stacks[0].Outputs[?OutputKey=='ListUsersApi'].OutputValue" --output text)
GET_USER_INFO_API=$(aws cloudformation describe-stacks --stack-name user-management-system --query "Stacks[0].Outputs[?OutputKey=='GetUserInfoApi'].OutputValue" --output text)
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name user-management-system --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)

echo "Login API: $LOGIN_API"
echo "Create User API: $CREATE_USER_API"
echo "List Users API: $LIST_USERS_API"
echo "Get User Info API: $GET_USER_INFO_API"
echo "User Pool ID: $USER_POOL_ID"

# Function to check if SuperAdmin users already exist
check_existing_superadmins() {
    local user_pool_id="$1"

    # List users and check for SuperAdmin role
    local superadmin_count=$(aws cognito-idp list-users \
        --user-pool-id "$user_pool_id" \
        --query "Users[?Attributes[?Name=='custom:user_role' && Value=='SuperAdmin']] | length(@)" \
        --output text 2>/dev/null || echo "0")

    echo "$superadmin_count"
}

# Function to create initial SuperAdmin user
create_initial_superadmin() {
    echo ""
    echo "👤 Initial SuperAdmin Setup"
    echo "=================================================="
    echo "Since this is a role-based system, you need at least one SuperAdmin"
    echo "to manage other users. Let's create your initial SuperAdmin account."
    echo ""

    # Prompt for SuperAdmin details
    read -p "📧 Enter SuperAdmin email: " ADMIN_EMAIL
    read -p "👤 Enter first name: " ADMIN_FIRST_NAME
    read -p "👤 Enter last name: " ADMIN_LAST_NAME

    # Generate or prompt for password
    echo ""
    echo "🔐 Password Requirements:"
    echo "   - At least 8 characters"
    echo "   - Contains uppercase and lowercase letters"
    echo "   - Contains numbers"
    echo ""
    read -s -p "🔑 Enter password for SuperAdmin: " ADMIN_PASSWORD
    echo ""

    # Validate inputs
    if [[ -z "$ADMIN_EMAIL" || -z "$ADMIN_FIRST_NAME" || -z "$ADMIN_LAST_NAME" || -z "$ADMIN_PASSWORD" ]]; then
        echo "❌ All fields are required. Skipping SuperAdmin creation."
        return 1
    fi

    echo ""
    echo "🔄 Creating SuperAdmin user in Cognito..."

    # Create user using AWS CLI
    aws cognito-idp admin-create-user \
        --user-pool-id "$USER_POOL_ID" \
        --username "$ADMIN_EMAIL" \
        --message-action SUPPRESS \
        --temporary-password "$ADMIN_PASSWORD" \
        --user-attributes \
            Name=email,Value="$ADMIN_EMAIL" \
            Name=given_name,Value="$ADMIN_FIRST_NAME" \
            Name=family_name,Value="$ADMIN_LAST_NAME" \
            Name=custom:user_role,Value="SuperAdmin" \
        2>/dev/null || echo "ℹ️  User might already exist"

    # Set permanent password
    aws cognito-idp admin-set-user-password \
        --user-pool-id "$USER_POOL_ID" \
        --username "$ADMIN_EMAIL" \
        --password "$ADMIN_PASSWORD" \
        --permanent \
        2>/dev/null || echo "ℹ️  Password might already be set"

    echo "✅ SuperAdmin created successfully!"
    echo "📧 Email: $ADMIN_EMAIL"
    echo "👤 Name: $ADMIN_FIRST_NAME $ADMIN_LAST_NAME"
    echo "🎭 Role: SuperAdmin"
    echo ""
    echo "🔑 You can now login with these credentials and create other users."
}

# Ask if user wants to create initial SuperAdmin (only if none exist and it's first deployment)
echo ""

if [[ "$IS_FIRST_DEPLOYMENT" == "true" ]]; then
    # Check if SuperAdmin users already exist
    EXISTING_SUPERADMIN_COUNT=$(check_existing_superadmins "$USER_POOL_ID")

    if [[ "$EXISTING_SUPERADMIN_COUNT" -gt 0 ]]; then
        echo "✅ Found $EXISTING_SUPERADMIN_COUNT existing SuperAdmin user(s) in the system"
        echo "   No need to create additional SuperAdmin users."
    else
        read -p "🤔 Do you want to create an initial SuperAdmin user? (y/N): " CREATE_ADMIN

        if [[ "$CREATE_ADMIN" =~ ^[Yy]$ ]]; then
            create_initial_superadmin
        else
            echo "⚠️  Remember to create a SuperAdmin user manually in the AWS Cognito console"
            echo "   or you won't be able to create other users through the API."
        fi
    fi
else
    echo "🔄 Subsequent deployment detected - skipping SuperAdmin user creation"
    echo "   (SuperAdmin users should already exist from initial deployment)"
fi

echo ""
echo "🎉 Setup complete! Your User Management System is ready to use."
