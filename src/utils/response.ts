import { APIGatewayProxyResult } from 'aws-lambda';

export interface BaseResponse {
    success: boolean;
    message: string;
    data?: any;
    error?: string;
}


export const createResponse = (
    statusCode: number,
    body: BaseResponse,
    allowedMethods: string = 'GET,POST,OPTIONS'
): APIGatewayProxyResult => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': allowedMethods
    },
    body: JSON.stringify(body)
});


export const createCorsResponse = (allowedMethods: string = 'GET,POST,OPTIONS'): APIGatewayProxyResult =>
    createResponse(200, {
        success: true,
        message: 'CORS preflight successful'
    }, allowedMethods);


export const createMethodNotAllowedResponse = (allowedMethod: string): APIGatewayProxyResult =>
    createResponse(405, {
        success: false,
        message: 'Method not allowed',
        error: `Only ${allowedMethod} method is supported`
    });


export const createValidationErrorResponse = (error: string): APIGatewayProxyResult =>
    createResponse(400, {
        success: false,
        message: 'Validation failed',
        error
    });


export const createAuthErrorResponse = (error: string): APIGatewayProxyResult =>
    createResponse(401, {
        success: false,
        message: 'Authentication required',
        error
    });


export const createAuthorizationErrorResponse = (error: string): APIGatewayProxyResult =>
    createResponse(403, {
        success: false,
        message: 'Access denied',
        error
    });


export const createNotFoundResponse = (error: string): APIGatewayProxyResult =>
    createResponse(404, {
        success: false,
        message: 'Not found',
        error
    });


export const createConflictResponse = (error: string): APIGatewayProxyResult =>
    createResponse(409, {
        success: false,
        message: 'Conflict',
        error
    });


export const createTooManyRequestsResponse = (error: string = 'Please try again later'): APIGatewayProxyResult =>
    createResponse(429, {
        success: false,
        message: 'Too many requests',
        error
    });


export const createInternalServerErrorResponse = (error: string = 'An unexpected error occurred'): APIGatewayProxyResult =>
    createResponse(500, {
        success: false,
        message: 'Internal server error',
        error
    });
