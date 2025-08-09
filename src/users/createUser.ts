import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
    createResponse,
    createCorsResponse,
    createMethodNotAllowedResponse,
    createValidationErrorResponse,
    createAuthErrorResponse,
    createAuthorizationErrorResponse,
    createConflictResponse,
    createTooManyRequestsResponse,
    createInternalServerErrorResponse
} from '../utils/response';
import { validateCreateUserRequest, validateAndParseJSON } from '../utils/validation';
import { validateTokenAndRole } from '../utils/auth';
import { createCognitoUser, handleCognitoError } from '../utils/cognito';

interface CreateUserRequest {
    email: string;
    firstName: string;
    lastName: string;
    role: 'Admin' | 'SuperAdmin' | 'User';
    temporaryPassword: string;
}

interface CreateUserResponse {
    success: boolean;
    message: string;
    data?: {
        userId: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
        status: string;
    };
    error?: string;
}

export const createUserHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log('Create user request received:', {
        path: event.path,
        method: event.httpMethod,
        headers: { ...event.headers, Authorization: '[REDACTED]' }
    });

    try {
        if (event.httpMethod === 'OPTIONS') {
            return createCorsResponse('POST,OPTIONS');
        }

        if (event.httpMethod !== 'POST') {
            return createMethodNotAllowedResponse('POST');
        }

        const authValidation = validateTokenAndRole(
            event.headers.Authorization || event.headers.authorization,
            ['Admin', 'SuperAdmin']
        );

        if (!authValidation.isValid) {
            if (authValidation.error?.includes('No valid authorization token')) {
                return createAuthErrorResponse(authValidation.error);
            }
            return createAuthorizationErrorResponse(authValidation.error!);
        }

        const parseResult = validateAndParseJSON(event.body);
        if (!parseResult.isValid) {
            return createValidationErrorResponse(parseResult.error!);
        }

        const requestBody: CreateUserRequest = parseResult.data;

        const validation = validateCreateUserRequest(requestBody);
        if (!validation.isValid) {
            return createValidationErrorResponse(validation.error!);
        }

        // Create user in Cognito
        const createdUser = await createCognitoUser({
            email: requestBody.email,
            firstName: requestBody.firstName,
            lastName: requestBody.lastName,
            role: requestBody.role,
            temporaryPassword: requestBody.temporaryPassword
        });

        const successResponse: CreateUserResponse = {
            success: true,
            message: 'User created successfully',
            data: {
                userId: createdUser.Username!,
                email: requestBody.email,
                firstName: requestBody.firstName,
                lastName: requestBody.lastName,
                role: requestBody.role,
                status: createdUser.UserStatus!
            }
        };

        console.log('User created successfully:', {
            userId: createdUser.Username,
            email: requestBody.email,
            role: requestBody.role,
            createdBy: authValidation.user?.email
        });

        return createResponse(201, successResponse);

    } catch (error: any) {
        console.error('Create user error:', error);

        const cognitoError = handleCognitoError(error);

        // Handle specific error types
        if (cognitoError.name === 'UsernameExistsException') {
            return createConflictResponse(cognitoError.message);
        }

        if (cognitoError.name === 'TooManyRequestsException') {
            return createTooManyRequestsResponse();
        }

        if (['InvalidPasswordException', 'InvalidParameterException'].includes(cognitoError.name)) {
            return createValidationErrorResponse(cognitoError.message);
        }

        return createInternalServerErrorResponse();
    }
};
