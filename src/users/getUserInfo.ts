import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
    createResponse,
    createCorsResponse,
    createMethodNotAllowedResponse,
    createAuthErrorResponse,
    createAuthorizationErrorResponse,
    createInternalServerErrorResponse
} from '../utils/response';
import { validateTokenAndRole } from '../utils/auth';

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

export const getUserInfoHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {

    try {
        if (event.httpMethod === 'OPTIONS') {
            return createCorsResponse('GET,OPTIONS');
        }

        if (event.httpMethod !== 'GET') {
            return createMethodNotAllowedResponse('GET');
        }

        // Validate authentication and authorization (Admin role required)
        const authValidation = validateTokenAndRole(
            event.headers.Authorization || event.headers.authorization,
            ['Admin']
        );

        if (!authValidation.isValid) {
            if (authValidation.error?.includes('No valid authorization token')) {
                return createAuthErrorResponse(authValidation.error);
            }
            return createAuthorizationErrorResponse(authValidation.error!);
        }

        const user = authValidation.user!;

        // Return user information from the JWT token
        const successResponse: UserInfoResponse = {
            success: true,
            message: 'User information retrieved successfully',
            data: {
                user: {
                    email: user.email,
                    firstName: user.firstName || '',
                    lastName: user.lastName || '',
                    role: user.role
                }
            }
        };

        return createResponse(200, successResponse);

    } catch (error: any) {
        return createInternalServerErrorResponse();
    }
};
