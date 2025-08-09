import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
    createResponse,
    createCorsResponse,
    createMethodNotAllowedResponse,
    createAuthErrorResponse,
    createAuthorizationErrorResponse,
    createTooManyRequestsResponse,
    createInternalServerErrorResponse
} from '../utils/response';
import { validateTokenAndRole } from '../utils/auth';
import { listCognitoUsers, handleCognitoError } from '../utils/cognito';

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

export const listUsersHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log('List users request received:', {
        path: event.path,
        method: event.httpMethod,
        headers: { ...event.headers, Authorization: '[REDACTED]' }
    });

    try {
        if (event.httpMethod === 'OPTIONS') {
            return createCorsResponse('GET,OPTIONS');
        }

        if (event.httpMethod !== 'GET') {
            return createMethodNotAllowedResponse('GET');
        }

        // Validate authentication and authorization (SuperAdmin role required)
        const authValidation = validateTokenAndRole(
            event.headers.Authorization || event.headers.authorization,
            ['SuperAdmin']
        );

        if (!authValidation.isValid) {
            if (authValidation.error?.includes('No valid authorization token')) {
                return createAuthErrorResponse(authValidation.error);
            }
            return createAuthorizationErrorResponse(authValidation.error!);
        }

        const user = authValidation.user!;

        console.log(`SuperAdmin ${user.role} requesting user list`);

        // List all users from Cognito
        const users = await listCognitoUsers(60); // Cognito max limit per request

        const successResponse: ListUsersResponse = {
            success: true,
            message: users.length > 0 ? 'Users retrieved successfully' : 'No users found',
            data: {
                users,
                totalUsers: users.length
            }
        };

        console.log(`Successfully retrieved ${users.length} users`);
        return createResponse(200, successResponse);

    } catch (error: any) {
        console.error('List users error:', error);

        const cognitoError = handleCognitoError(error);

        if (cognitoError.name === 'TooManyRequestsException') {
            return createTooManyRequestsResponse();
        }

        return createInternalServerErrorResponse();
    }
};
