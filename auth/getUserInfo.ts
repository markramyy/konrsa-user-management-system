import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

interface UserInfoResponse {
    success: boolean;
    message: string;
    data?: {
        user: {
            email: string;
            firstName: string;
            lastName: string;
            role: string;
        };
    };
    error?: string;
}

const createResponse = (statusCode: number, body: UserInfoResponse): APIGatewayProxyResult => ({
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

const validateAdminAccess = (token: string): { isValid: boolean; error?: string; payload?: any } => {
    try {
        const payload = decodeJWTPayload(token);
        const userRole = payload['custom:user_role'];

        if (userRole !== 'Admin') {
            return {
                isValid: false,
                error: 'Access denied. Admin role required.'
            };
        }

        return { isValid: true, payload };
    } catch (error) {
        return {
            isValid: false,
            error: 'Invalid or expired token'
        };
    }
};

export const getUserInfoHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log('Get user info request received:', {
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

        // Validate Admin access
        const validation = validateAdminAccess(token);
        if (!validation.isValid) {
            return createResponse(403, {
                success: false,
                message: 'Forbidden',
                error: validation.error
            });
        }

        const userPayload = validation.payload!;

        console.log(`Admin ${userPayload['custom:user_role']} requesting own user info`);

        // Extract user information from the JWT token
        const user = {
            email: userPayload.email || '',
            firstName: userPayload.given_name || '',
            lastName: userPayload.family_name || '',
            role: userPayload['custom:user_role'] || 'User'
        };

        const successResponse: UserInfoResponse = {
            success: true,
            message: 'User information retrieved successfully',
            data: {
                user
            }
        };

        console.log(`Successfully retrieved user info for: ${user.email}`);
        return createResponse(200, successResponse);

    } catch (error: any) {
        console.error('Get user info error:', error);

        return createResponse(500, {
            success: false,
            message: 'Internal server error',
            error: 'An unexpected error occurred'
        });
    }
};
