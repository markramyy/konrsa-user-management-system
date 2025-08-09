import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
    createResponse,
    createCorsResponse,
    createMethodNotAllowedResponse,
    createValidationErrorResponse,
    createAuthErrorResponse,
    createInternalServerErrorResponse,
    createTooManyRequestsResponse
} from '../utils/response';
import { validateLoginRequest, validateAndParseJSON } from '../utils/validation';
import { authenticateUser, handleCognitoError } from '../utils/cognito';
import { decodeJWTPayload } from '../utils/auth';

interface LoginRequest {
    email: string;
    password: string;
}

interface LoginResponse {
    success: boolean;
    message: string;
    data?: {
        accessToken: string;
        idToken: string;
        refreshToken: string;
        user: {
            email: string;
            firstName: string;
            lastName: string;
            role: string;
        };
    };
    error?: string;
}

export const loginHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log('Login request received:', {
        path: event.path,
        method: event.httpMethod,
        headers: { ...event.headers, authorization: '[REDACTED]' }
    });

    try {
        if (event.httpMethod === 'OPTIONS') {
            return createCorsResponse('POST,OPTIONS');
        }

        if (event.httpMethod !== 'POST') {
            return createMethodNotAllowedResponse('POST');
        }

        const parseResult = validateAndParseJSON(event.body);
        if (!parseResult.isValid) {
            return createValidationErrorResponse(parseResult.error!);
        }

        const requestBody: LoginRequest = parseResult.data;

        const validation = validateLoginRequest(requestBody);
        if (!validation.isValid) {
            return createValidationErrorResponse(validation.error!);
        }

        // Authenticate with Cognito
        const authResult = await authenticateUser({
            email: requestBody.email,
            password: requestBody.password
        });

        const { AccessToken, IdToken, RefreshToken } = authResult;

        if (!IdToken) {
            return createAuthErrorResponse('ID token not received');
        }

        const userPayload = decodeJWTPayload(IdToken);

        const successResponse: LoginResponse = {
            success: true,
            message: 'Login successful',
            data: {
                accessToken: AccessToken!,
                idToken: IdToken,
                refreshToken: RefreshToken!,
                user: {
                    email: userPayload.email,
                    firstName: userPayload.given_name || '',
                    lastName: userPayload.family_name || '',
                    role: userPayload['custom:user_role'] || 'User'
                }
            }
        };

        console.log('Login successful for user:', userPayload.email);
        return createResponse(200, successResponse);

    } catch (error: any) {
        console.error('Login error:', error);

        const cognitoError = handleCognitoError(error);

        // Handle specific error types
        if (cognitoError.name === 'TooManyRequestsException') {
            return createTooManyRequestsResponse();
        }

        if (['NotAuthorizedException', 'UserNotConfirmedException', 'PasswordResetRequiredException', 'UserNotFoundException'].includes(cognitoError.name)) {
            return createAuthErrorResponse(cognitoError.message);
        }

        return createInternalServerErrorResponse();
    }
};
