import {
    CognitoIdentityProviderClient,
    AdminCreateUserCommand,
    AdminSetUserPasswordCommand,
    AdminInitiateAuthCommand,
    ListUsersCommand,
    UserType
} from '@aws-sdk/client-cognito-identity-provider';


const USER_POOL_ID = process.env.USER_POOL_ID!;
const CLIENT_ID = process.env.CLIENT_ID!;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';


export const cognito = new CognitoIdentityProviderClient({ region: AWS_REGION });


export interface CreateUserParams {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    temporaryPassword: string;
}

export interface LoginParams {
    email: string;
    password: string;
}

export interface CognitoUser {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    status: string;
    createdDate: string;
    lastModifiedDate: string;
}

/**
 * Gets attribute value from Cognito user attributes array
 * @param attributes Array of user attributes
 * @param attributeName Name of the attribute to retrieve
 * @returns Attribute value or empty string if not found
 */
export const getAttributeValue = (attributes: any[] | undefined, attributeName: string): string => {
    if (!attributes) return '';
    const attribute = attributes.find(attr => attr.Name === attributeName);
    return attribute?.Value || '';
};

/**
 * Transforms Cognito User object to our CognitoUser interface
 * @param user Cognito User object
 * @returns CognitoUser object
 */
export const transformCognitoUser = (user: UserType): CognitoUser => ({
    email: getAttributeValue(user.Attributes, 'email'),
    firstName: getAttributeValue(user.Attributes, 'given_name'),
    lastName: getAttributeValue(user.Attributes, 'family_name'),
    role: getAttributeValue(user.Attributes, 'custom:user_role') || 'User',
    status: user.UserStatus || 'UNKNOWN',
    createdDate: user.UserCreateDate?.toISOString() || '',
    lastModifiedDate: user.UserLastModifiedDate?.toISOString() || ''
});

/**
 * Creates a new user in Cognito User Pool
 * @param params CreateUserParams object
 * @returns Promise<UserType> Created user object
 */
export const createCognitoUser = async (params: CreateUserParams): Promise<UserType> => {
    const createUserCommand = new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: params.email,
        MessageAction: 'SUPPRESS', // Don't send welcome email
        TemporaryPassword: params.temporaryPassword,
        UserAttributes: [
            { Name: 'email', Value: params.email },
            { Name: 'given_name', Value: params.firstName },
            { Name: 'family_name', Value: params.lastName },
            { Name: 'custom:user_role', Value: params.role }
        ]
    });

    const createResult = await cognito.send(createUserCommand);

    if (!createResult.User) {
        throw new Error('Failed to create user in Cognito');
    }

    // Set permanent password
    const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: params.email,
        Password: params.temporaryPassword,
        Permanent: true
    });

    await cognito.send(setPasswordCommand);

    return createResult.User;
};


export const authenticateUser = async (params: LoginParams) => {
    const authCommand = new AdminInitiateAuthCommand({
        UserPoolId: USER_POOL_ID,
        ClientId: CLIENT_ID,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: {
            USERNAME: params.email,
            PASSWORD: params.password
        }
    });

    const authResult = await cognito.send(authCommand);

    if (!authResult.AuthenticationResult) {
        throw new Error('Authentication failed - no result received');
    }

    return authResult.AuthenticationResult;
};


export const listCognitoUsers = async (limit: number = 60): Promise<CognitoUser[]> => {
    const listCommand = new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Limit: limit
    });

    const result = await cognito.send(listCommand);

    if (!result.Users) {
        return [];
    }

    return result.Users.map(transformCognitoUser);
};


export const handleCognitoError = (error: any): { name: string; message: string } => {
    const errorMap: Record<string, string> = {
        'UsernameExistsException': 'A user with this email already exists',
        'InvalidPasswordException': 'Password does not meet necessary requirements',
        'InvalidParameterException': 'Invalid user data provided',
        'NotAuthorizedException': 'Invalid email or password',
        'UserNotConfirmedException': 'User account not confirmed',
        'PasswordResetRequiredException': 'Password reset required',
        'UserNotFoundException': 'Invalid email or password',
        'TooManyRequestsException': 'Please try again later'
    };

    return {
        name: error.name || 'UnknownError',
        message: errorMap[error.name] || 'An unexpected error occurred'
    };
};
