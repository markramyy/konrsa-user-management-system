import { createUserHandler } from '../users/createUser';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as cognito from '../utils/cognito';
import * as auth from '../utils/auth';

jest.mock('../utils/cognito');
jest.mock('../utils/auth');

const mockedCognito = cognito as jest.Mocked<typeof cognito>;
const mockedAuth = auth as jest.Mocked<typeof auth>;

describe('Create User Handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const createMockEvent = (
        httpMethod: string = 'POST',
        body: string | null = null,
        headers: Record<string, string> = {}
    ): APIGatewayProxyEvent => ({
        httpMethod,
        path: '/users',
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
            const result = await createUserHandler(event);
            expect(result.statusCode).toBe(200);
            expect(result.headers).toMatchObject({
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': expect.stringContaining('POST')
            });
        });

        test('should return 405 for unsupported HTTP methods', async () => {
            const event = createMockEvent('GET');
            const result = await createUserHandler(event);
            expect(result.statusCode).toBe(405);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.message).toContain('Method not allowed');
        });

    });

    describe('Authorization', () => {

        test('should return 401 if no authorization token', async () => {
            mockedAuth.validateTokenAndRole.mockReturnValue({ isValid: false, error: 'No valid authorization token' });
            const event = createMockEvent('POST', '{}', {});
            const result = await createUserHandler(event);
            expect(result.statusCode).toBe(401);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.message).toBe('Authentication required');
        });

        test('should return 403 if not authorized', async () => {
            mockedAuth.validateTokenAndRole.mockReturnValue({ isValid: false, error: 'Not authorized' });
            const event = createMockEvent('POST', '{}', { Authorization: 'Bearer token' });
            const result = await createUserHandler(event);
            expect(result.statusCode).toBe(403);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.message).toBe('Access denied');
        });

    });

    describe('Request Validation', () => {

        beforeEach(() => {
            mockedAuth.validateTokenAndRole.mockReturnValue({ isValid: true, user: { email: 'admin@example.com', role: 'Admin' } });
        });

        test('should return 400 for invalid JSON body', async () => {
            const event = createMockEvent('POST', 'invalid json', { Authorization: 'Bearer token' });
            const result = await createUserHandler(event);
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.message).toBe('Validation failed');
        });

        test('should return 400 for missing required fields', async () => {
            const event = createMockEvent('POST', JSON.stringify({ email: 'test@example.com' }), { Authorization: 'Bearer token' });
            const result = await createUserHandler(event);
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.error).toBeDefined();
        });

    });

    describe('Successful User Creation', () => {

        beforeEach(() => {
            mockedAuth.validateTokenAndRole.mockReturnValue({ isValid: true, user: { email: 'admin@example.com', role: 'Admin' } });
        });

        test('should return 201 for successful user creation', async () => {
            mockedCognito.createCognitoUser.mockResolvedValue({ Username: 'user-123', UserStatus: 'FORCE_CHANGE_PASSWORD' });
            const event = createMockEvent('POST', JSON.stringify({
                email: 'newuser@example.com',
                firstName: 'New',
                lastName: 'User',
                role: 'User',
                temporaryPassword: 'TempPass123!'
            }), { Authorization: 'Bearer token' });
            const result = await createUserHandler(event);
            expect(result.statusCode).toBe(201);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(true);
            expect(body.message).toBe('User created successfully');
            expect(body.data).toMatchObject({
                userId: 'user-123',
                email: 'newuser@example.com',
                firstName: 'New',
                lastName: 'User',
                role: 'User',
                status: 'FORCE_CHANGE_PASSWORD'
            });
        });

    });

    describe('Cognito Errors', () => {

        beforeEach(() => {
            mockedAuth.validateTokenAndRole.mockReturnValue({ isValid: true, user: { email: 'admin@example.com', role: 'Admin' } });
        });

        test('should return 409 if user already exists', async () => {
            const cognitoError = new Error('User already exists');
            cognitoError.name = 'UsernameExistsException';
            mockedCognito.createCognitoUser.mockRejectedValue(cognitoError);
            mockedCognito.handleCognitoError.mockReturnValue({ name: 'UsernameExistsException', message: 'User already exists' });
            const event = createMockEvent('POST', JSON.stringify({
                email: 'existing@example.com',
                firstName: 'Exist',
                lastName: 'User',
                role: 'User',
                temporaryPassword: 'TempPass123!'
            }), { Authorization: 'Bearer token' });
            const result = await createUserHandler(event);
            expect(result.statusCode).toBe(409);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.message).toBe('Conflict');
        });

        test('should return 429 for too many requests', async () => {
            const cognitoError = new Error('Too many requests');
            cognitoError.name = 'TooManyRequestsException';
            mockedCognito.createCognitoUser.mockRejectedValue(cognitoError);
            mockedCognito.handleCognitoError.mockReturnValue({ name: 'TooManyRequestsException', message: 'Too many requests' });
            const event = createMockEvent('POST', JSON.stringify({
                email: 'user@example.com',
                firstName: 'User',
                lastName: 'User',
                role: 'User',
                temporaryPassword: 'TempPass123!'
            }), { Authorization: 'Bearer token' });
            const result = await createUserHandler(event);
            expect(result.statusCode).toBe(429);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.message).toBe('Too many requests');
        });

        test('should return 400 for invalid password', async () => {
            const cognitoError = new Error('Password does not meet requirements');
            cognitoError.name = 'InvalidPasswordException';
            mockedCognito.createCognitoUser.mockRejectedValue(cognitoError);
            mockedCognito.handleCognitoError.mockReturnValue({ name: 'InvalidPasswordException', message: 'Password does not meet requirements' });
            const event = createMockEvent('POST', JSON.stringify({
                email: 'user@example.com',
                firstName: 'User',
                lastName: 'User',
                role: 'User',
                temporaryPassword: 'bad'
            }), { Authorization: 'Bearer token' });
            const result = await createUserHandler(event);
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.message).toBe('Validation failed');
        });

        test('should return 500 for internal server errors', async () => {
            const unexpectedError = new Error('Unexpected error');
            mockedCognito.createCognitoUser.mockRejectedValue(unexpectedError);
            mockedCognito.handleCognitoError.mockReturnValue({ name: 'InternalError', message: 'Internal server error' });
            const event = createMockEvent('POST', JSON.stringify({
                email: 'user@example.com',
                firstName: 'User',
                lastName: 'User',
                role: 'User',
                temporaryPassword: 'TempPass123!'
            }), { Authorization: 'Bearer token' });
            const result = await createUserHandler(event);
            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.message).toBe('Internal server error');
        });

    });
});
