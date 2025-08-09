"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUserHandler = void 0;
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const cognito = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({ region: AWS_REGION });
const createResponse = (statusCode, body) => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'POST,OPTIONS'
    },
    body: JSON.stringify(body)
});
const extractUserFromToken = (authHeader) => {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('No valid authorization token provided');
    }
    const token = authHeader.replace('Bearer ', '');
    try {
        const payload = token.split('.')[1];
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
        return {
            email: decoded.email,
            role: decoded['custom:user_role'] || 'User',
            firstName: decoded.given_name,
            lastName: decoded.family_name
        };
    }
    catch (error) {
        throw new Error('Invalid token format');
    }
};
const isAuthorized = (userRole) => {
    const allowedRoles = ['Admin', 'SuperAdmin'];
    return allowedRoles.includes(userRole);
};
const validateCreateUserRequest = (body) => {
    const required = ['email', 'firstName', 'lastName', 'role', 'temporaryPassword'];
    for (const field of required) {
        if (!body[field]) {
            return {
                isValid: false,
                error: `${field} is required`
            };
        }
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
        return {
            isValid: false,
            error: 'Invalid email format'
        };
    }
    const validRoles = ['Admin', 'SuperAdmin', 'User'];
    if (!validRoles.includes(body.role)) {
        return {
            isValid: false,
            error: 'Role must be one of: Admin, SuperAdmin, User'
        };
    }
    if (body.temporaryPassword.length < 8) {
        return {
            isValid: false,
            error: 'Temporary password must be at least 8 characters long'
        };
    }
    return { isValid: true };
};
const createUserHandler = async (event) => {
    console.log('Create user request received:', {
        path: event.path,
        method: event.httpMethod,
        headers: { ...event.headers, Authorization: '[REDACTED]' }
    });
    try {
        if (event.httpMethod === 'OPTIONS') {
            return createResponse(200, {
                success: true,
                message: 'CORS preflight successful'
            });
        }
        if (event.httpMethod !== 'POST') {
            return createResponse(405, {
                success: false,
                message: 'Method not allowed',
                error: 'Only POST method is supported'
            });
        }
        let currentUser;
        try {
            currentUser = extractUserFromToken(event.headers.Authorization || event.headers.authorization);
        }
        catch (error) {
            return createResponse(401, {
                success: false,
                message: 'Authentication required',
                error: error.message
            });
        }
        if (!isAuthorized(currentUser.role)) {
            return createResponse(403, {
                success: false,
                message: 'Access denied',
                error: 'Only Admin and SuperAdmin users can create new users'
            });
        }
        if (!event.body) {
            return createResponse(400, {
                success: false,
                message: 'Bad request',
                error: 'Request body is required'
            });
        }
        let requestBody;
        try {
            requestBody = JSON.parse(event.body);
        }
        catch (error) {
            return createResponse(400, {
                success: false,
                message: 'Bad request',
                error: 'Invalid JSON format'
            });
        }
        const validation = validateCreateUserRequest(requestBody);
        if (!validation.isValid) {
            return createResponse(400, {
                success: false,
                message: 'Validation failed',
                error: validation.error
            });
        }
        const createUserCommand = new client_cognito_identity_provider_1.AdminCreateUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: requestBody.email,
            MessageAction: 'SUPPRESS', // Don't send welcome email
            TemporaryPassword: requestBody.temporaryPassword,
            UserAttributes: [
                { Name: 'email', Value: requestBody.email },
                { Name: 'given_name', Value: requestBody.firstName },
                { Name: 'family_name', Value: requestBody.lastName },
                { Name: 'custom:user_role', Value: requestBody.role }
            ]
        });
        const createResult = await cognito.send(createUserCommand);
        if (!createResult.User) {
            return createResponse(500, {
                success: false,
                message: 'User creation failed',
                error: 'Failed to create user in Cognito'
            });
        }
        const setPasswordCommand = new client_cognito_identity_provider_1.AdminSetUserPasswordCommand({
            UserPoolId: USER_POOL_ID,
            Username: requestBody.email,
            Password: requestBody.temporaryPassword,
            Permanent: true
        });
        await cognito.send(setPasswordCommand);
        const successResponse = {
            success: true,
            message: 'User created successfully',
            data: {
                userId: createResult.User.Username,
                email: requestBody.email,
                firstName: requestBody.firstName,
                lastName: requestBody.lastName,
                role: requestBody.role,
                status: createResult.User.UserStatus
            }
        };
        console.log('User created successfully:', {
            userId: createResult.User.Username,
            email: requestBody.email,
            role: requestBody.role,
            createdBy: currentUser.email
        });
        return createResponse(201, successResponse);
    }
    catch (error) {
        console.error('Create user error:', error);
        if (error.name === 'UsernameExistsException') {
            return createResponse(409, {
                success: false,
                message: 'User creation failed',
                error: 'A user with this email already exists'
            });
        }
        if (error.name === 'InvalidPasswordException') {
            return createResponse(400, {
                success: false,
                message: 'User creation failed',
                error: 'Password does not meet necessary requirements'
            });
        }
        if (error.name === 'InvalidParameterException') {
            return createResponse(400, {
                success: false,
                message: 'User creation failed',
                error: 'Invalid user data provided'
            });
        }
        if (error.name === 'TooManyRequestsException') {
            return createResponse(429, {
                success: false,
                message: 'Too many requests',
                error: 'Please try again later'
            });
        }
        return createResponse(500, {
            success: false,
            message: 'Internal server error',
            error: 'An unexpected error occurred'
        });
    }
};
exports.createUserHandler = createUserHandler;
