# Migration Guide

## SAM Template Updates

If you're using AWS SAM, update your `template.yaml` to point to the new file locations:

### Before (Old Structure)
```yaml
LoginFunction:
  Type: AWS::Serverless::Function
  Properties:
    CodeUri: auth/
    Handler: login.loginHandler

CreateUserFunction:
  Type: AWS::Serverless::Function
  Properties:
    CodeUri: auth/
    Handler: createUser.createUserHandler
```

### After (New Structure)
```yaml
LoginFunction:
  Type: AWS::Serverless::Function
  Properties:
    CodeUri: src/
    Handler: auth/login.loginHandler

CreateUserFunction:
  Type: AWS::Serverless::Function
  Properties:
    CodeUri: src/
    Handler: users/createUser.createUserHandler

GetUserInfoFunction:
  Type: AWS::Serverless::Function
  Properties:
    CodeUri: src/
    Handler: users/getUserInfo.getUserInfoHandler

ListUsersFunction:
  Type: AWS::Serverless::Function
  Properties:
    CodeUri: src/
    Handler: users/listUsers.listUsersHandler
```

## File Mapping

| Old Location | New Location | Purpose |
|-------------|-------------|---------|
| `auth/login.ts` | `src/auth/login.ts` | User authentication |
| `auth/createUser.ts` | `src/users/createUser.ts` | Create new user |
| `auth/getUserInfo.ts` | `src/users/getUserInfo.ts` | Get user information |
| `auth/listUsers.ts` | `src/users/listUsers.ts` | List all users |

## Benefits of New Structure

1. **Clear Separation**: Authentication vs User Management
2. **Reusable Code**: Common utilities in `utils/` folder
3. **Better Maintainability**: Consistent patterns across all functions
4. **Type Safety**: Improved TypeScript support
5. **Error Handling**: Centralized and consistent error responses

## Next Steps

1. Update your SAM template or deployment configuration
2. Test the new handlers
3. Remove the old `auth/` directory once migration is confirmed
4. Update any import statements in other parts of your application
