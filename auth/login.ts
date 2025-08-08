import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
    CognitoIdentityProviderClient,
    AdminInitiateAuthCommand
} from '@aws-sdk/client-cognito-identity-provider';

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

const USER_POOL_ID = process.env.USER_POOL_ID!;
const CLIENT_ID = process.env.CLIENT_ID!;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const cognito = new CognitoIdentityProviderClient({ region: AWS_REGION });

const createResponse = (statusCode: number, body: LoginResponse): APIGatewayProxyResult => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'POST,OPTIONS'
    },
    body: JSON.stringify(body)
});

const validateLoginRequest = (body: any): { isValid: boolean; error?: string } => {
    if (!body.email || !body.password) {
        return {
            isValid: false,
            error: 'Email and password are required'
        };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
        return {
            isValid: false,
            error: 'Invalid email format'
        };
    }

    return { isValid: true };
};

const decodeJWTPayload = (token: string) => {
    try {
        const payload = token.split('.')[1];
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
        return decoded;
    } catch (error) {
        throw new Error('Invalid token format');
    }
};

export const loginHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log('Login request received:', {
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

        if (event.httpMethod !== 'POST') {
            return createResponse(405, {
                success: false,
                message: 'Method not allowed',
                error: 'Only POST method is supported'
            });
        }

        if (!event.body) {
            return createResponse(400, {
                success: false,
                message: 'Bad request',
                error: 'Request body is required'
            });
        }

        let requestBody: LoginRequest;
        try {
            requestBody = JSON.parse(event.body);
        } catch (error) {
            return createResponse(400, {
                success: false,
                message: 'Bad request',
                error: 'Invalid JSON format'
            });
        }

        const validation = validateLoginRequest(requestBody);
        if (!validation.isValid) {
            return createResponse(400, {
                success: false,
                message: 'Validation failed',
                error: validation.error
            });
        }

        // Attempt authentication with Cognito
        const authCommand = new AdminInitiateAuthCommand({
            UserPoolId: USER_POOL_ID,
            ClientId: CLIENT_ID,
            AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
            AuthParameters: {
                USERNAME: requestBody.email,
                PASSWORD: requestBody.password
            }
        });

        const authResult = await cognito.send(authCommand);

        if (!authResult.AuthenticationResult) {
            return createResponse(401, {
                success: false,
                message: 'Authentication failed',
                error: 'Invalid credentials or user not confirmed'
            });
        }

        const { AccessToken, IdToken, RefreshToken } = authResult.AuthenticationResult;

        if (!IdToken) {
            return createResponse(500, {
                success: false,
                message: 'Authentication error',
                error: 'ID token not received'
            });
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
                    firstName: userPayload.given_name,
                    lastName: userPayload.family_name,
                    role: userPayload['custom:user_role'] || 'User'
                }
            }
        };

        console.log('Login successful for user:', userPayload.email);
        return createResponse(200, successResponse);

    } catch (error: any) {
        console.error('Login error:', error);

        if (error.name === 'NotAuthorizedException') {
            return createResponse(401, {
                success: false,
                message: 'Authentication failed',
                error: 'Invalid email or password'
            });
        }

        if (error.name === 'UserNotConfirmedException') {
            return createResponse(401, {
                success: false,
                message: 'Authentication failed',
                error: 'User account not confirmed'
            });
        }

        if (error.name === 'PasswordResetRequiredException') {
            return createResponse(401, {
                success: false,
                message: 'Authentication failed',
                error: 'Password reset required'
            });
        }

        if (error.name === 'UserNotFoundException') {
            return createResponse(401, {
                success: false,
                message: 'Authentication failed',
                error: 'Invalid email or password'
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
