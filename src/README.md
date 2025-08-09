# User Management System - Refactored Structure

This directory contains the refactored user management system with improved organization and reusable utilities.

## Directory Structure

```
src/
├── auth/                   # Authentication related endpoints
│   └── login.ts           # User login handler
├── users/                 # User management endpoints
│   ├── createUser.ts      # Create new user handler
│   ├── getUserInfo.ts     # Get user information handler
│   └── listUsers.ts       # List all users handler
├── utils/                 # Reusable utility functions
│   ├── auth.ts           # JWT token handling and authorization
│   ├── cognito.ts        # AWS Cognito operations
│   ├── response.ts       # Standardized API responses
│   └── validation.ts     # Input validation functions
├── index.ts              # Main exports
├── package.json          # Dependencies
└── tsconfig.json         # TypeScript configuration
```

## Key Improvements

### 1. Separation of Concerns
- **Authentication** (`auth/`): Handles user login and authentication
- **User Management** (`users/`): Handles user CRUD operations
- **Utilities** (`utils/`): Reusable functions for common operations

### 2. Reusable Utilities

#### Response Utilities (`utils/response.ts`)
- Standardized API Gateway responses with CORS headers
- Consistent error response formats
- Helper functions for common HTTP status codes

#### Authentication Utilities (`utils/auth.ts`)
- JWT token extraction and validation
- User role authorization checks
- Token payload decoding

#### Validation Utilities (`utils/validation.ts`)
- Input validation for all request types
- Email format validation
- Password strength validation
- Role validation

#### Cognito Utilities (`utils/cognito.ts`)
- AWS Cognito operations wrapper
- User creation and authentication
- Error handling for Cognito-specific errors
- User list management

### 3. Consistent Error Handling
- Centralized error mapping
- User-friendly error messages
- Proper HTTP status codes
- Structured error responses

### 4. Type Safety
- Strong TypeScript typing throughout
- Interface definitions for all request/response objects
- Type-safe AWS SDK usage

## Usage

### Authentication
```typescript
import { loginHandler } from './auth/login';
```

### User Management
```typescript
import {
    createUserHandler,
    getUserInfoHandler,
    listUsersHandler
} from './users';
```

### Utilities
```typescript
import {
    createResponse,
    validateTokenAndRole,
    createCognitoUser
} from './utils';
```

## Migration from Old Structure

The old `auth/` directory contained mixed authentication and user management functions:
- `auth/login.ts` → `src/auth/login.ts` (authentication)
- `auth/createUser.ts` → `src/users/createUser.ts` (user management)
- `auth/getUserInfo.ts` → `src/users/getUserInfo.ts` (user management)
- `auth/listUsers.ts` → `src/users/listUsers.ts` (user management)

## Benefits

1. **Better Organization**: Clear separation between auth and user management
2. **Code Reuse**: Common utilities eliminate code duplication
3. **Maintainability**: Easier to maintain and extend
4. **Type Safety**: Full TypeScript support with proper types
5. **Consistency**: Standardized responses and error handling
6. **Testability**: Modular design makes unit testing easier

## Environment Variables

Make sure these environment variables are set:
- `USER_POOL_ID`: AWS Cognito User Pool ID
- `CLIENT_ID`: AWS Cognito Client ID
- `AWS_REGION`: AWS Region (defaults to 'us-east-1')
