import { getUserInfoHandler } from '../users/getUserInfo';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as auth from '../utils/auth';

jest.mock('../utils/auth');

const mockedAuth = auth as jest.Mocked<typeof auth>;

describe('Get User Info Handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const createMockEvent = (
        httpMethod: string = 'GET',
        headers: Record<string, string> = {}
    ): APIGatewayProxyEvent => ({
        httpMethod,
        path: '/user/info',
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
            const result = await getUserInfoHandler(event);

            expect(result.statusCode).toBe(200);
            expect(result.headers).toMatchObject({
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': expect.stringContaining('GET')
            });
        });

        test('should return 405 for unsupported HTTP methods', async () => {
            const event = createMockEvent('POST');
            const result = await getUserInfoHandler(event);

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
            const result = await getUserInfoHandler(event);

            expect(result.statusCode).toBe(401);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.message).toBe('Authentication required');
        });

        test('should return 403 if user is not an Admin', async () => {
            mockedAuth.validateTokenAndRole.mockReturnValue({
                isValid: false,
                error: 'Insufficient permissions. Admin role required'
            });

            const event = createMockEvent('GET', {
                Authorization: 'Bearer token'
            });
            const result = await getUserInfoHandler(event);

            expect(result.statusCode).toBe(403);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.message).toBe('Access denied');
        });

        test('should verify Admin role is required', async () => {
            mockedAuth.validateTokenAndRole.mockReturnValue({
                isValid: true,
                user: {
                    email: 'admin@example.com',
                    firstName: 'Admin',
                    lastName: 'User',
                    role: 'Admin'
                }
            });

            const event = createMockEvent('GET', {
                Authorization: 'Bearer token'
            });
            await getUserInfoHandler(event);

            expect(mockedAuth.validateTokenAndRole).toHaveBeenCalledWith(
                'Bearer token',
                ['Admin']
            );
        });
    });

    describe('Successful User Info Retrieval', () => {
        test('should return 200 with user info for valid Admin token', async () => {
            const mockUser = {
                email: 'admin@example.com',
                firstName: 'John',
                lastName: 'Admin',
                role: 'Admin'
            };

            mockedAuth.validateTokenAndRole.mockReturnValue({
                isValid: true,
                user: mockUser
            });

            const event = createMockEvent('GET', {
                Authorization: 'Bearer valid-token'
            });
            const result = await getUserInfoHandler(event);

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(true);
            expect(body.message).toBe('User information retrieved successfully');
            expect(body.data).toMatchObject({
                user: {
                email: 'admin@example.com',
                firstName: 'John',
                lastName: 'Admin',
                role: 'Admin'
                }
            });
        });

        test('should handle missing firstName and lastName gracefully', async () => {
            const mockUser = {
                email: 'admin@example.com',
                role: 'Admin'
            };

            mockedAuth.validateTokenAndRole.mockReturnValue({
                isValid: true,
                user: mockUser
            });

            const event = createMockEvent('GET', {
                Authorization: 'Bearer valid-token'
            });
            const result = await getUserInfoHandler(event);

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.data.user).toMatchObject({
                email: 'admin@example.com',
                firstName: '',
                lastName: '',
                role: 'Admin'
            });
        });

        test('should work with authorization header in lowercase', async () => {
            const mockUser = {
                email: 'admin@example.com',
                firstName: 'Jane',
                lastName: 'Admin',
                role: 'Admin'
            };

            mockedAuth.validateTokenAndRole.mockReturnValue({
                isValid: true,
                user: mockUser
            });

            const event = createMockEvent('GET', {
                authorization: 'Bearer valid-token' // lowercase
            });
            const result = await getUserInfoHandler(event);

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(true);
            expect(body.data.user.email).toBe('admin@example.com');

            expect(mockedAuth.validateTokenAndRole).toHaveBeenCalledWith(
                'Bearer valid-token',
                ['Admin']
            );
        });

    });

    describe('Error Handling', () => {
        test('should return 500 for unexpected errors', async () => {
            mockedAuth.validateTokenAndRole.mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            const event = createMockEvent('GET', {
                Authorization: 'Bearer token'
            });
            const result = await getUserInfoHandler(event);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.message).toBe('Internal server error');
        });
    });
});
