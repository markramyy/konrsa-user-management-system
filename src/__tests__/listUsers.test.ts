import { listUsersHandler } from '../users/listUsers';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as cognito from '../utils/cognito';
import * as auth from '../utils/auth';

jest.mock('../utils/cognito');
jest.mock('../utils/auth');

const mockedCognito = cognito as jest.Mocked<typeof cognito>;
const mockedAuth = auth as jest.Mocked<typeof auth>;

describe('List Users Handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const createMockEvent = (
        httpMethod: string = 'GET',
        headers: Record<string, string> = {}
    ): APIGatewayProxyEvent => ({
        httpMethod,
        path: '/users',
        headers,
        body: null,
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
            const result = await listUsersHandler(event);

            expect(result.statusCode).toBe(200);
            expect(result.headers).toMatchObject({
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': expect.stringContaining('GET')
            });
        });

        test('should return 405 for unsupported HTTP methods', async () => {
            const event = createMockEvent('POST');
            const result = await listUsersHandler(event);

            expect(result.statusCode).toBe(405);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.message).toContain('Method not allowed');
        });
    });

    describe('Authorization', () => {
        test('should return 401 if no authorization token', async () => {
            mockedAuth.validateTokenAndRole.mockReturnValue({
                isValid: false,
                error: 'No valid authorization token'
            });

            const event = createMockEvent('GET', {});
            const result = await listUsersHandler(event);

            expect(result.statusCode).toBe(401);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.message).toBe('Authentication required');
        });

        test('should return 403 if user is not a SuperAdmin', async () => {
            mockedAuth.validateTokenAndRole.mockReturnValue({
                isValid: false,
                error: 'Insufficient permissions. SuperAdmin role required'
            });

            const event = createMockEvent('GET', {
                Authorization: 'Bearer token'
            });
            const result = await listUsersHandler(event);

            expect(result.statusCode).toBe(403);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.message).toBe('Access denied');
        });

        test('should verify SuperAdmin role is required', async () => {
            mockedAuth.validateTokenAndRole.mockReturnValue({
                isValid: true,
                user: {
                email: 'superadmin@example.com',
                firstName: 'Super',
                lastName: 'Admin',
                role: 'SuperAdmin'
                }
            });

            mockedCognito.listCognitoUsers.mockResolvedValue([]);

            const event = createMockEvent('GET', {
                Authorization: 'Bearer token'
            });
            await listUsersHandler(event);

            expect(mockedAuth.validateTokenAndRole).toHaveBeenCalledWith(
                'Bearer token',
                ['SuperAdmin']
            );
        });
    });

    describe('Successful User Listing', () => {
        beforeEach(() => {
            mockedAuth.validateTokenAndRole.mockReturnValue({
                isValid: true,
                user: {
                email: 'superadmin@example.com',
                firstName: 'Super',
                lastName: 'Admin',
                role: 'SuperAdmin'
                }
            });
        });

        test('should return 200 with users list when users exist', async () => {
            const mockUsers = [
                {
                email: 'user1@example.com',
                firstName: 'John',
                lastName: 'Doe',
                role: 'User',
                status: 'CONFIRMED',
                createdDate: '2024-01-01T10:00:00Z',
                lastModifiedDate: '2024-01-01T10:00:00Z'
                },
                {
                email: 'admin@example.com',
                firstName: 'Jane',
                lastName: 'Admin',
                role: 'Admin',
                status: 'CONFIRMED',
                createdDate: '2024-01-02T10:00:00Z',
                lastModifiedDate: '2024-01-02T10:00:00Z'
                }
            ];

            mockedCognito.listCognitoUsers.mockResolvedValue(mockUsers);

            const event = createMockEvent('GET', {
                Authorization: 'Bearer valid-token'
            });
            const result = await listUsersHandler(event);

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(true);
            expect(body.message).toBe('Users retrieved successfully');
            expect(body.data).toMatchObject({
                users: mockUsers,
                totalUsers: 2
            });

            expect(mockedCognito.listCognitoUsers).toHaveBeenCalledWith(60);
        });

        test('should return 200 with empty users list when no users exist', async () => {
            mockedCognito.listCognitoUsers.mockResolvedValue([]);

            const event = createMockEvent('GET', {
                Authorization: 'Bearer valid-token'
            });
            const result = await listUsersHandler(event);

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(true);
            expect(body.message).toBe('No users found');
            expect(body.data).toMatchObject({
                users: [],
                totalUsers: 0
            });
        });

        test('should work with authorization header in lowercase', async () => {
            mockedCognito.listCognitoUsers.mockResolvedValue([]);

            const event = createMockEvent('GET', {
                authorization: 'Bearer valid-token' // lowercase
            });
            const result = await listUsersHandler(event);

            expect(result.statusCode).toBe(200);
            expect(mockedAuth.validateTokenAndRole).toHaveBeenCalledWith(
                'Bearer valid-token',
                ['SuperAdmin']
            );
        });
    });

    describe('Cognito Errors', () => {
        beforeEach(() => {
            mockedAuth.validateTokenAndRole.mockReturnValue({
                isValid: true,
                user: {
                email: 'superadmin@example.com',
                role: 'SuperAdmin'
                }
            });
        });

        test('should return 429 for too many requests', async () => {
            const cognitoError = new Error('Too many requests');
            cognitoError.name = 'TooManyRequestsException';

            mockedCognito.listCognitoUsers.mockRejectedValue(cognitoError);
            mockedCognito.handleCognitoError.mockReturnValue({
                name: 'TooManyRequestsException',
                message: 'Too many requests'
            });

            const event = createMockEvent('GET', {
                Authorization: 'Bearer token'
            });
            const result = await listUsersHandler(event);

            expect(result.statusCode).toBe(429);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.message).toBe('Too many requests');
        });

        test('should return 500 for other Cognito errors', async () => {
            const cognitoError = new Error('Cognito service error');
            cognitoError.name = 'ServiceException';

            mockedCognito.listCognitoUsers.mockRejectedValue(cognitoError);
            mockedCognito.handleCognitoError.mockReturnValue({
                name: 'ServiceException',
                message: 'Service temporarily unavailable'
            });

            const event = createMockEvent('GET', {
                Authorization: 'Bearer token'
            });
            const result = await listUsersHandler(event);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.message).toBe('Internal server error');
        });
    });

    describe('Error Handling', () => {
        beforeEach(() => {
            mockedAuth.validateTokenAndRole.mockReturnValue({
                isValid: true,
                user: {
                email: 'superadmin@example.com',
                role: 'SuperAdmin'
                }
            });
        });

        test('should return 500 for unexpected errors', async () => {
            const unexpectedError = new Error('Unexpected error');

            mockedCognito.listCognitoUsers.mockRejectedValue(unexpectedError);
            mockedCognito.handleCognitoError.mockReturnValue({
                name: 'UnexpectedError',
                message: 'Unexpected error occurred'
            });

            const event = createMockEvent('GET', {
                Authorization: 'Bearer token'
            });
            const result = await listUsersHandler(event);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.message).toBe('Internal server error');
        });
    });
});
