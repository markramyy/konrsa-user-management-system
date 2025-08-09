export interface UserInfo {
    email: string;
    role: string;
    firstName?: string;
    lastName?: string;
}


export interface DecodedJWTPayload {
    email: string;
    given_name?: string;
    family_name?: string;
    'custom:user_role'?: string;
    [key: string]: any;
}


export const extractTokenFromHeader = (authHeader?: string): string => {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('No valid authorization token provided');
    }
    return authHeader.replace('Bearer ', '');
};


export const decodeJWTPayload = (token: string): DecodedJWTPayload => {
    try {
        const payload = token.split('.')[1];
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
        return decoded;
    } catch (error) {
        throw new Error('Invalid token format');
    }
};


export const extractUserFromToken = (authHeader?: string): UserInfo => {
    const token = extractTokenFromHeader(authHeader);
    const payload = decodeJWTPayload(token);

    return {
        email: payload.email,
        role: payload['custom:user_role'] || 'User',
        firstName: payload.given_name,
        lastName: payload.family_name
    };
};


export const isAuthorized = (userRole: string, allowedRoles: string[]): boolean => {
    return allowedRoles.includes(userRole);
};


export const isAdmin = (userRole: string): boolean => {
    return isAuthorized(userRole, ['Admin']);
};


export const isSuperAdmin = (userRole: string): boolean => {
    return isAuthorized(userRole, ['SuperAdmin']);
};


export const validateTokenAndRole = (
    authHeader?: string,
    requiredRoles: string[] = []
): { isValid: boolean; error?: string; user?: UserInfo } => {
    try {
        const user = extractUserFromToken(authHeader);

        if (requiredRoles.length > 0 && !isAuthorized(user.role, requiredRoles)) {
            return {
                isValid: false,
                error: `Access denied. Required roles: ${requiredRoles.join(', ')}`
            };
        }

        return { isValid: true, user };
    } catch (error: any) {
        return {
            isValid: false,
            error: error.message
        };
    }
};
