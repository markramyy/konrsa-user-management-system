export interface ValidationResult {
    isValid: boolean;
    error?: string;
}


export const validateEmail = (email: string): ValidationResult => {
    if (!email) {
        return {
            isValid: false,
            error: 'Email is required'
        };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return {
            isValid: false,
            error: 'Invalid email format'
        };
    }

    return { isValid: true };
};


export const validatePassword = (password: string, minLength: number = 8): ValidationResult => {
    if (!password) {
        return {
            isValid: false,
            error: 'Password is required'
        };
    }

    if (password.length < minLength) {
        return {
            isValid: false,
            error: `Password must be at least ${minLength} characters long`
        };
    }

    return { isValid: true };
};


export const validateRole = (role: string, allowedRoles: string[] = ['Admin', 'SuperAdmin', 'User']): ValidationResult => {
    if (!role) {
        return {
            isValid: false,
            error: 'Role is required'
        };
    }

    if (!allowedRoles.includes(role)) {
        return {
            isValid: false,
            error: `Role must be one of: ${allowedRoles.join(', ')}`
        };
    }

    return { isValid: true };
};


export const validateRequiredFields = (data: any, requiredFields: string[]): ValidationResult => {
    for (const field of requiredFields) {
        if (!data[field]) {
            return {
                isValid: false,
                error: `${field} is required`
            };
        }
    }

    return { isValid: true };
};


export const validateLoginRequest = (body: any): ValidationResult => {
    const requiredValidation = validateRequiredFields(body, ['email', 'password']);
    if (!requiredValidation.isValid) {
        return requiredValidation;
    }

    const emailValidation = validateEmail(body.email);
    if (!emailValidation.isValid) {
        return emailValidation;
    }

    return { isValid: true };
};


export const validateCreateUserRequest = (body: any): ValidationResult => {
    const requiredValidation = validateRequiredFields(body, ['email', 'firstName', 'lastName', 'role', 'temporaryPassword']);
    if (!requiredValidation.isValid) {
        return requiredValidation;
    }

    const emailValidation = validateEmail(body.email);
    if (!emailValidation.isValid) {
        return emailValidation;
    }

    const roleValidation = validateRole(body.role);
    if (!roleValidation.isValid) {
        return roleValidation;
    }

    const passwordValidation = validatePassword(body.temporaryPassword);
    if (!passwordValidation.isValid) {
        return passwordValidation;
    }

    return { isValid: true };
};


export const validateAndParseJSON = (body: string | null): { isValid: boolean; data?: any; error?: string } => {
    if (!body) {
        return {
            isValid: false,
            error: 'Request body is required'
        };
    }

    try {
        const parsed = JSON.parse(body);
        return {
            isValid: true,
            data: parsed
        };
    } catch (error) {
        return {
            isValid: false,
            error: 'Invalid JSON format'
        };
    }
};
