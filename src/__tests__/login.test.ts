import { loginHandler } from '../auth/login';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as cognito from '../utils/cognito';
import * as auth from '../utils/auth';

// Mock the dependencies
jest.mock('../utils/cognito');
jest.mock('../utils/auth');

const mockedCognito = cognito as jest.Mocked<typeof cognito>;
const mockedAuth = auth as jest.Mocked<typeof auth>;

describe('Login Handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const createMockEvent = (
        httpMethod: string = 'POST',
        body: string | null = null,
        headers: Record<string, string> = {}
    ): APIGatewayProxyEvent => ({
        httpMethod,
        path: '/login',
        headers,
        body,
        isBase64Encoded: false,
        pathParameters: null,
        queryStringParameters: null,
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: ''
    });

    describe('HTTP Method Handling', () => {
        test('should handle OPTIONS request (CORS preflight)', async () => {
        const event = createMockEvent('OPTIONS');
        const result = await loginHandler(event);

        expect(result.statusCode).toBe(200);
        expect(result.headers).toMatchObject({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': expect.stringContaining('POST')
        });
        });

        test('should return 405 for unsupported HTTP methods', async () => {
        const event = createMockEvent('GET');
        const result = await loginHandler(event);

        expect(result.statusCode).toBe(405);
        const body = JSON.parse(result.body);
        expect(body.success).toBe(false);
        expect(body.message).toBe('Method not allowed');
        });
    });

    describe('Request Validation', () => {
        test('should return 400 for invalid JSON body', async () => {
        const event = createMockEvent('POST', 'invalid json');
        const result = await loginHandler(event);

        expect(result.statusCode).toBe(400);
        const body = JSON.parse(result.body);
        expect(body.success).toBe(false);
        expect(body.message).toBe('Validation failed');
        });

        test('should return 400 for missing email', async () => {
        const event = createMockEvent('POST', JSON.stringify({
            password: 'password123'
        }));
        const result = await loginHandler(event);

        expect(result.statusCode).toBe(400);
        const body = JSON.parse(result.body);
        expect(body.success).toBe(false);
        expect(body.error).toContain('email');
        });

        test('should return 400 for missing password', async () => {
        const event = createMockEvent('POST', JSON.stringify({
            email: 'test@example.com'
        }));
        const result = await loginHandler(event);

        expect(result.statusCode).toBe(400);
        const body = JSON.parse(result.body);
        expect(body.success).toBe(false);
        expect(body.error).toContain('password');
        });

        test('should return 400 for invalid email format', async () => {
        const event = createMockEvent('POST', JSON.stringify({
            email: 'invalid-email',
            password: 'password123'
        }));
        const result = await loginHandler(event);

        expect(result.statusCode).toBe(400);
        const body = JSON.parse(result.body);
        expect(body.success).toBe(false);
        expect(body.error).toContain('email');
        });
    });

    describe('Successful Login', () => {
        test('should return 200 for successful login', async () => {
        // Mock successful authentication
        mockedCognito.authenticateUser.mockResolvedValue({
            AccessToken: 'mock-access-token',
            IdToken: 'mock-id-token',
            RefreshToken: 'mock-refresh-token'
        });

        // Mock JWT payload decoding
        mockedAuth.decodeJWTPayload.mockReturnValue({
            email: 'test@example.com',
            given_name: 'John',
            family_name: 'Doe',
            'custom:user_role': 'Admin'
        });

        const event = createMockEvent('POST', JSON.stringify({
            email: 'test@example.com',
            password: 'password123'
        }));

        const result = await loginHandler(event);

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.success).toBe(true);
        expect(body.message).toBe('Login successful');
        expect(body.data).toMatchObject({
            accessToken: 'mock-access-token',
            idToken: 'mock-id-token',
            refreshToken: 'mock-refresh-token',
            user: {
            email: 'test@example.com',
            firstName: 'John',
            lastName: 'Doe',
            role: 'Admin'
            }
        });

        expect(mockedCognito.authenticateUser).toHaveBeenCalledWith({
            email: 'test@example.com',
            password: 'password123'
        });
        });

        test('should handle missing user attributes gracefully', async () => {
        // Mock successful authentication
        mockedCognito.authenticateUser.mockResolvedValue({
            AccessToken: 'mock-access-token',
            IdToken: 'mock-id-token',
            RefreshToken: 'mock-refresh-token'
        });

        // Mock JWT payload with minimal data
        mockedAuth.decodeJWTPayload.mockReturnValue({
            email: 'test@example.com'
        });

        const event = createMockEvent('POST', JSON.stringify({
            email: 'test@example.com',
            password: 'password123'
        }));

        const result = await loginHandler(event);

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.data.user).toMatchObject({
            email: 'test@example.com',
            firstName: '',
            lastName: '',
            role: 'User' // Default role
        });
        });
    });

    describe('Authentication Errors', () => {
        test('should return 401 for invalid credentials', async () => {
        const cognitoError = new Error('Incorrect username or password.');
        cognitoError.name = 'NotAuthorizedException';

        mockedCognito.authenticateUser.mockRejectedValue(cognitoError);
        mockedCognito.handleCognitoError.mockReturnValue({
            name: 'NotAuthorizedException',
            message: 'Invalid email or password'
        });

        const event = createMockEvent('POST', JSON.stringify({
            email: 'test@example.com',
            password: 'wrongpassword'
        }));

        const result = await loginHandler(event);

        expect(result.statusCode).toBe(401);
        const body = JSON.parse(result.body);
        expect(body.success).toBe(false);
        expect(body.message).toBe('Authentication required');
        });

        test('should return 429 for too many requests', async () => {
        const cognitoError = new Error('Too many requests');
        cognitoError.name = 'TooManyRequestsException';

        mockedCognito.authenticateUser.mockRejectedValue(cognitoError);
        mockedCognito.handleCognitoError.mockReturnValue({
            name: 'TooManyRequestsException',
            message: 'Too many requests'
        });

        const event = createMockEvent('POST', JSON.stringify({
            email: 'test@example.com',
            password: 'password123'
        }));

        const result = await loginHandler(event);

        expect(result.statusCode).toBe(429);
        const body = JSON.parse(result.body);
        expect(body.success).toBe(false);
        expect(body.message).toBe('Too many requests');
        });

        test('should return 401 for unconfirmed user', async () => {
        const cognitoError = new Error('User is not confirmed.');
        cognitoError.name = 'UserNotConfirmedException';

        mockedCognito.authenticateUser.mockRejectedValue(cognitoError);
        mockedCognito.handleCognitoError.mockReturnValue({
            name: 'UserNotConfirmedException',
            message: 'User account is not confirmed'
        });

        const event = createMockEvent('POST', JSON.stringify({
            email: 'test@example.com',
            password: 'password123'
        }));

        const result = await loginHandler(event);

        expect(result.statusCode).toBe(401);
        const body = JSON.parse(result.body);
        expect(body.success).toBe(false);
        expect(body.message).toBe('Authentication required');
        });

        test('should return 500 for internal server errors', async () => {
        const unexpectedError = new Error('Unexpected error');

        mockedCognito.authenticateUser.mockRejectedValue(unexpectedError);
        mockedCognito.handleCognitoError.mockReturnValue({
            name: 'InternalError',
            message: 'Internal server error'
        });

        const event = createMockEvent('POST', JSON.stringify({
            email: 'test@example.com',
            password: 'password123'
        }));

        const result = await loginHandler(event);

        expect(result.statusCode).toBe(500);
        const body = JSON.parse(result.body);
        expect(body.success).toBe(false);
        expect(body.message).toBe('Internal server error');
        });

        test('should return 401 when ID token is missing', async () => {
        // Mock authentication with missing IdToken
        mockedCognito.authenticateUser.mockResolvedValue({
            AccessToken: 'mock-access-token',
            IdToken: undefined,
            RefreshToken: 'mock-refresh-token'
        });

        const event = createMockEvent('POST', JSON.stringify({
            email: 'test@example.com',
            password: 'password123'
        }));

        const result = await loginHandler(event);

        expect(result.statusCode).toBe(401);
        const body = JSON.parse(result.body);
        expect(body.success).toBe(false);
        expect(body.message).toBe('Authentication required');
        expect(body.error).toBe('ID token not received');
        });
    });
});
