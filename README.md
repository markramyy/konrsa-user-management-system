# User Management System

A serverless user management system built with AWS services: Cognito, Lambda, API Gateway, and SAM. This system provides secure user authentication, role-based access control, and comprehensive user management capabilities.

## 🏗️ Architecture

The application uses the following AWS services:
- **AWS Cognito**: User authentication and management with custom attributes
- **AWS Lambda**: Serverless compute for API handlers
- **API Gateway**: RESTful API endpoints with CORS support
- **CloudFormation**: Infrastructure as Code via SAM templates

## 📁 Project Structure

```
user-management-system/
├── src/                          # Source code
│   ├── auth/                     # Authentication endpoints
│   │   └── login.ts             # User login handler
│   ├── users/                   # User management endpoints
│   │   ├── createUser.ts        # Create new user (Admin+)
│   │   ├── getUserInfo.ts       # Get current user info (Admin+)
│   │   └── listUsers.ts         # List all users (SuperAdmin only)
│   ├── utils/                   # Reusable utilities
│   │   ├── auth.ts             # JWT token handling & authorization
│   │   ├── cognito.ts          # AWS Cognito operations
│   │   ├── response.ts         # Standardized API responses
│   │   └── validation.ts       # Input validation functions
│   ├── __tests__/              # Unit tests
│   ├── package.json            # Dependencies
│   └── tsconfig.json           # TypeScript configuration
├── events/                      # Lambda test events
├── coverage/                   # Test coverage reports
├── template.yaml               # SAM infrastructure template
├── build-and-deploy.sh        # Deployment script
├── jest.config.js             # Jest test configuration
└── package.json               # Root dependencies
```

## 🔗 API Endpoints

| Endpoint | Method | Description                          | Access Control     | Authentication |
|----------|--------|--------------------------------------|--------------------|----------------|
| `/login` | POST   | Login user and return JWT tokens     | Public             | None           |
| `/users` | POST   | Create a new user                    | Admin + SuperAdmin | JWT Required   |
| `/users` | GET    | List all users from Cognito          | SuperAdmin only    | JWT Required   |
| `/me`    | GET    | Return info about the logged-in user | Admin only         | JWT Required   |

### API Request/Response Examples

#### Login (`POST /login`)
```json
// Request
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

// Response
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJ...",
    "idToken": "eyJ...",
    "refreshToken": "eyJ...",
    "user": {
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "Admin"
    }
  }
}
```

#### Create User (`POST /users`)
```json
// Request
{
  "email": "newuser@example.com",
  "firstName": "Jane",
  "lastName": "Smith",
  "role": "Admin",
  "temporaryPassword": "TempPass123!"
}

// Response
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "userId": "uuid-here",
    "email": "newuser@example.com",
    "firstName": "Jane",
    "lastName": "Smith",
    "role": "Admin",
    "status": "FORCE_CHANGE_PASSWORD"
  }
}
```

## 🛡️ Security Features

- **JWT Authentication**: Secure token-based authentication
- **Role-Based Access Control**: Three user roles (User, Admin, SuperAdmin)
- **Password Policy**: Enforced strong passwords (8+ chars, mixed case, numbers)
- **Email Verification**: Auto-verified email attributes
- **CORS Support**: Proper cross-origin resource sharing
- **Input Validation**: Comprehensive request validation
- **Error Handling**: Secure error responses without sensitive data exposure

## 🚀 Quick Start

### Prerequisites

- [AWS CLI](https://aws.amazon.com/cli/) configured with appropriate permissions
- [SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html)
- [Node.js 22+](https://nodejs.org/)
- [Docker](https://www.docker.com/) for local testing

### Installation & Deployment

1. **Clone the repository**
```bash
git clone <repository-url>
cd user-management-system
```

2. **Install dependencies**
```bash
npm install
cd src && npm install && cd ..
```

3. **Build and deploy with initial SuperAdmin setup**
```bash
# Quick deployment with automatic SuperAdmin creation
chmod +x build-and-deploy.sh
./build-and-deploy.sh
```

The deployment script will:
- **First run**: Use `sam deploy --guided` for initial configuration
- **Subsequent runs**: Use `sam deploy` with saved configuration
- Display all API endpoints
- **Prompt you to create an initial SuperAdmin user** (first run only)
- **Skip SuperAdmin creation if users already exist**

**First deployment** - when prompted, provide:
- SuperAdmin email address
- First and last name
- Secure password (8+ chars, mixed case, numbers)

**Subsequent deployments** - the script will:
- Detect existing deployment configuration
- Skip the guided setup process
- Skip SuperAdmin user creation (users already exist)4. **Alternative: Manual deployment**
```bash
cd src && npm run build && cd ..
sam deploy --guided
```

⚠️ **Important**: If you choose manual deployment, you'll need to create your first SuperAdmin user manually in the AWS Cognito console before you can use the API to manage other users.

### Initial SuperAdmin Setup (Bootstrap Problem Solution)

Since this is a role-based access control system, you need at least one SuperAdmin to create other users. The build script solves this "bootstrap problem" by automatically creating your first SuperAdmin during the **initial deployment**.

**Why this is needed:**
- The `/users` POST endpoint requires Admin+ permissions
- Without any existing users, you can't login to get the required JWT token
- The deployment script creates your first SuperAdmin directly in Cognito on first run
- Once you have a SuperAdmin, you can login and create other users through the API

**Smart Deployment Behavior:**
- **First Run**: Script uses `sam deploy --guided` and offers to create SuperAdmin
- **Subsequent Runs**: Script uses `sam deploy` and skips SuperAdmin creation
- **Existing Users Check**: Script automatically detects if SuperAdmin users already exist
- **Configuration Tracking**: Uses `.deployment-config` file to track deployment status

**Manual SuperAdmin Creation (if needed):**
```bash
# Get your User Pool ID from CloudFormation outputs
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name user-management-system --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)

# Create SuperAdmin user
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username "admin@yourcompany.com" \
  --message-action SUPPRESS \
  --temporary-password "TempPass123!" \
  --user-attributes \
    Name=email,Value="admin@yourcompany.com" \
    Name=given_name,Value="System" \
    Name=family_name,Value="Admin" \
    Name=custom:user_role,Value="SuperAdmin"

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username "admin@yourcompany.com" \
  --password "YourSecurePass123!" \
  --permanent
```

## 🔧 Development

### Local Development

Build your application with the `sam build` command:

```bash
sam build
```

Test locally with SAM CLI:

```bash
# Start API locally
sam local start-api

# Test specific function
sam local invoke LoginFunction --event events/event.json
```

### Environment Variables

The following environment variables are automatically configured by SAM:
- `USER_POOL_ID`: AWS Cognito User Pool ID
- `CLIENT_ID`: AWS Cognito Client ID
- `AWS_REGION`: AWS Region

## 🧪 Testing

Run the comprehensive test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

Test files are located in `src/__tests__/` and cover:
- Authentication flows
- User management operations
- Authorization checks
- Input validation
- Error handling

### Test Coverage

The test suite provides comprehensive coverage of:
- ✅ Login functionality
- ✅ User creation with role validation
- ✅ User information retrieval
- ✅ User listing with authorization
- ✅ JWT token validation
- ✅ Input validation
- ✅ Error scenarios

## 📮 Manual Testing with Postman

Since the system uses role-based access control, you need to follow a specific flow when testing manually:

### 1. Get Your API Endpoints

After deployment, your endpoints will be displayed. You can also get them anytime:

```bash
# Get all endpoints
aws cloudformation describe-stacks --stack-name user-management-system --query "Stacks[0].Outputs"
```

### 2. Login with Your SuperAdmin

**POST** `https://your-api-gateway-url/login`
```json
{
  "email": "your-superadmin@email.com",
  "password": "YourSecurePassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJ...",
    "idToken": "eyJhbGciOiJSUzI1NiIsI...",
    "refreshToken": "eyJ...",
    "user": {
      "email": "your-superadmin@email.com",
      "firstName": "Your",
      "lastName": "Name",
      "role": "SuperAdmin"
    }
  }
}
```

### 3. Save the JWT Token

Copy the `idToken` from the login response. You'll need to add it to the `Authorization` header for subsequent requests:

```
Authorization: Bearer eyJhbGciOiJSUzI1NiIsI...
```

### 4. Test Each Endpoint

#### Create a New User (Admin+ Required)
**POST** `https://your-api-gateway-url/users`
```json
{
  "email": "newuser@example.com",
  "firstName": "New",
  "lastName": "User",
  "role": "Admin",
  "temporaryPassword": "TempPass123!"
}
```

#### List All Users (SuperAdmin Only)
**GET** `https://your-api-gateway-url/users`
- Headers: `Authorization: Bearer your-jwt-token`

#### Get Current User Info (Admin+ Only)
**GET** `https://your-api-gateway-url/me`
- Headers: `Authorization: Bearer your-jwt-token`

### 5. Test Access Controls

To verify role-based access control:

1. **Login as different user roles** and test endpoint access
2. **Try accessing endpoints without JWT tokens** (should get 401)
3. **Try accessing restricted endpoints with lower-privilege tokens** (should get 403)

### Postman Collection Tips

Create environment variables in Postman:
- `baseUrl`: Your API Gateway URL
- `jwtToken`: Current user's JWT token (update after each login)

Example request headers:
```
Content-Type: application/json
Authorization: Bearer {{jwtToken}}
```

## 📊 Monitoring & Logs

View Lambda function logs:

```bash
# Tail logs for specific function
sam logs -n LoginFunction --stack-name user-management-system --tail

# View logs for all functions
sam logs --stack-name user-management-system --tail
```

## 🎯 Key Features

### Robust Architecture
- **Modular Design**: Clear separation of concerns with utilities
- **Type Safety**: Full TypeScript implementation
- **Error Handling**: Comprehensive error management with user-friendly messages
- **Code Reuse**: Shared utilities eliminate duplication

### User Roles & Permissions
- **User**: Basic user (default role)
- **Admin**: Can access user info and create other users
- **SuperAdmin**: Full access including user listing

### AWS Cognito Integration
- Custom user attribute for role management
- Secure password policies
- Email-based usernames
- Automatic email verification

## 📚 Additional Resources

- [AWS SAM Developer Guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html)
- [AWS Cognito Documentation](https://docs.aws.amazon.com/cognito/)
- [API Gateway Documentation](https://docs.aws.amazon.com/apigateway/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)

## 🗑️ Cleanup

To delete the deployed application:

```bash
sam delete --stack-name user-management-system
```

This will remove all AWS resources created by the template.
