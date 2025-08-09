import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
    CognitoIdentityProviderClient,
    ListUsersCommand
} from '@aws-sdk/client-cognito-identity-provider';

interface ListUsersResponse {
    success: boolean;
    message: string;
    data?: {
        users: Array<{
            email: string;
            firstName: string;
            lastName: string;
            role: string;
            status: string;
            createdDate: string;
            lastModifiedDate: string;
        }>;
        totalUsers: number;
    };
    error?: string;
}

const USER_POOL_ID = process.env.USER_POOL_ID!;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const cognito = new CognitoIdentityProviderClient({ region: AWS_REGION });

const createResponse = (statusCode: number, body: ListUsersResponse): APIGatewayProxyResult => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
    },
    body: JSON.stringify(body)
});

const decodeJWTPayload = (token: string) => {
    try {
        const payload = token.split('.')[1];
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
        return decoded;
    } catch (error) {
        throw new Error('Invalid token format');
    }
};

const extractTokenFromHeader = (authHeader: string | undefined): string | null => {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.substring(7);
};

const validateSuperAdminAccess = (token: string): { isValid: boolean; error?: string; userRole?: string } => {
    try {
        const payload = decodeJWTPayload(token);
        const userRole = payload['custom:user_role'];

        if (userRole !== 'SuperAdmin') {
            return {
                isValid: false,
                error: 'Access denied. SuperAdmin role required.',
                userRole
            };
        }

        return { isValid: true, userRole };
    } catch (error) {
        return {
            isValid: false,
            error: 'Invalid or expired token'
        };
    }
};

const getAttributeValue = (attributes: any[] | undefined, attributeName: string): string => {
    if (!attributes) return '';
    const attribute = attributes.find(attr => attr.Name === attributeName);
    return attribute?.Value || '';
};

export const listUsersHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log('List users request received:', {
        path: event.path,
        method: event.httpMethod,
        headers: event.headers
    });

    try {
        if (event.httpMethod === 'OPTIONS') {
            return createResponse(200, {
                success: true,
                message: 'CORS preflight successful'
            });
        }

        if (event.httpMethod !== 'GET') {
            return createResponse(405, {
                success: false,
                message: 'Method not allowed',
                error: 'Only GET method is supported'
            });
        }

        // Extract and validate JWT token
        const token = extractTokenFromHeader(event.headers.Authorization || event.headers.authorization);
        if (!token) {
            return createResponse(401, {
                success: false,
                message: 'Unauthorized',
                error: 'Authorization token is required'
            });
        }

        // Validate SuperAdmin access
        const validation = validateSuperAdminAccess(token);
        if (!validation.isValid) {
            return createResponse(403, {
                success: false,
                message: 'Forbidden',
                error: validation.error
            });
        }

        console.log(`SuperAdmin ${validation.userRole} requesting user list`);

        // List all users from Cognito
        const listCommand = new ListUsersCommand({
            UserPoolId: USER_POOL_ID,
            Limit: 60 // Cognito max limit per request
        });

        const result = await cognito.send(listCommand);

        if (!result.Users) {
            return createResponse(200, {
                success: true,
                message: 'No users found',
                data: {
                    users: [],
                    totalUsers: 0
                }
            });
        }

        // Transform Cognito users to our response format
        const users = result.Users.map(user => ({
            email: getAttributeValue(user.Attributes, 'email'),
            firstName: getAttributeValue(user.Attributes, 'given_name'),
            lastName: getAttributeValue(user.Attributes, 'family_name'),
            role: getAttributeValue(user.Attributes, 'custom:user_role') || 'User',
            status: user.UserStatus || 'UNKNOWN',
            createdDate: user.UserCreateDate?.toISOString() || '',
            lastModifiedDate: user.UserLastModifiedDate?.toISOString() || ''
        }));

        const successResponse: ListUsersResponse = {
            success: true,
            message: 'Users retrieved successfully',
            data: {
                users,
                totalUsers: users.length
            }
        };

        console.log(`Successfully retrieved ${users.length} users`);
        return createResponse(200, successResponse);

    } catch (error: any) {
        console.error('List users error:', error);

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
