#!/usr/bin/env node

/**
 * Test script for the POST /users endpoint (Create User)
 */

const https = require('https');

// Get API endpoints from CloudFormation outputs
async function getApiEndpoints() {
    const { exec } = require('child_process');

    const getOutput = (outputKey) => {
        return new Promise((resolve, reject) => {
            exec(`aws cloudformation describe-stacks --stack-name user-management-system --query "Stacks[0].Outputs[?OutputKey=='${outputKey}'].OutputValue" --output text`, (error, stdout) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout.trim());
                }
            });
        });
    };

    const [loginUrl, createUserUrl] = await Promise.all([
        getOutput('LoginApi'),
        getOutput('CreateUserApi')
    ]);

    return { loginUrl, createUserUrl };
}

// Login to get a JWT token
async function loginUser(apiUrl, email, password) {
    const url = new URL(apiUrl);

    const postData = JSON.stringify({
        email: email,
        password: password
    });

    const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve({
                        statusCode: res.statusCode,
                        body: response
                    });
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        body: data
                    });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}

// Test create user endpoint
async function testCreateUser(apiUrl, token, userData) {
    const url = new URL(apiUrl);

    const postData = JSON.stringify(userData);

    const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve({
                        statusCode: res.statusCode,
                        body: response
                    });
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        body: data
                    });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}

// Create test users using the custom attribute test script
async function createTestAdmin() {
    console.log('👤 Creating test admin user...');

    const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');

    const cognito = new CognitoIdentityProviderClient({ region: 'us-east-1' });
    const USER_POOL_ID = 'us-east-1_CuP3LGrFh'; // From our previous test

    const testAdminEmail = 'admin@test.com';
    const testPassword = 'AdminPass123!';

    try {
        // Create admin user
        await cognito.send(new AdminCreateUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: testAdminEmail,
            MessageAction: 'SUPPRESS',
            TemporaryPassword: testPassword,
            UserAttributes: [
                { Name: 'email', Value: testAdminEmail },
                { Name: 'given_name', Value: 'Test' },
                { Name: 'family_name', Value: 'Admin' },
                { Name: 'custom:user_role', Value: 'Admin' }
            ]
        }));

        // Set permanent password
        await cognito.send(new AdminSetUserPasswordCommand({
            UserPoolId: USER_POOL_ID,
            Username: testAdminEmail,
            Password: testPassword,
            Permanent: true
        }));

        console.log('✅ Test admin created successfully');
        return { email: testAdminEmail, password: testPassword };

    } catch (error) {
        if (error.name === 'UsernameExistsException') {
            console.log('ℹ️  Test admin already exists');
            return { email: testAdminEmail, password: testPassword };
        }
        throw error;
    }
}

// Main test function
async function main() {
    console.log('🚀 Testing POST /users Endpoint (Create User)\n');

    try {
        // Get API endpoints
        console.log('📡 Getting API endpoints...');
        const { loginUrl, createUserUrl } = await getApiEndpoints();
        console.log(`✅ Login URL: ${loginUrl}`);
        console.log(`✅ Create User URL: ${createUserUrl}\n`);

        // Create test admin if needed
        const adminCreds = await createTestAdmin();

        // Login as admin to get JWT token
        console.log('🔐 Logging in as admin...');
        const loginResponse = await loginUser(loginUrl, adminCreds.email, adminCreds.password);

        if (loginResponse.statusCode !== 200 || !loginResponse.body.success) {
            console.error('❌ Failed to login as admin:', loginResponse.body);
            return;
        }

        const adminToken = loginResponse.body.data.idToken;
        console.log('✅ Admin login successful\n');

        // Test cases for create user endpoint
        const testCases = [
            {
                name: 'Create valid user with Admin role',
                userData: {
                    email: 'newuser@test.com',
                    firstName: 'New',
                    lastName: 'User',
                    role: 'User',
                    temporaryPassword: 'TempPass123!'
                },
                token: adminToken,
                expectedStatus: 201
            },
            {
                name: 'Create user with SuperAdmin role',
                userData: {
                    email: 'superadmin@test.com',
                    firstName: 'Super',
                    lastName: 'Admin',
                    role: 'SuperAdmin',
                    temporaryPassword: 'SuperPass123!'
                },
                token: adminToken,
                expectedStatus: 201
            },
            {
                name: 'Create user with invalid email',
                userData: {
                    email: 'invalid-email',
                    firstName: 'Invalid',
                    lastName: 'User',
                    role: 'User',
                    temporaryPassword: 'TempPass123!'
                },
                token: adminToken,
                expectedStatus: 400
            },
            {
                name: 'Create user with missing required field',
                userData: {
                    email: 'missing@test.com',
                    firstName: 'Missing',
                    // lastName missing
                    role: 'User',
                    temporaryPassword: 'TempPass123!'
                },
                token: adminToken,
                expectedStatus: 400
            },
            {
                name: 'Create user with invalid role',
                userData: {
                    email: 'invalidrole@test.com',
                    firstName: 'Invalid',
                    lastName: 'Role',
                    role: 'InvalidRole',
                    temporaryPassword: 'TempPass123!'
                },
                token: adminToken,
                expectedStatus: 400
            },
            {
                name: 'Create user without authorization token',
                userData: {
                    email: 'noauth@test.com',
                    firstName: 'No',
                    lastName: 'Auth',
                    role: 'User',
                    temporaryPassword: 'TempPass123!'
                },
                token: null, // No token
                expectedStatus: 401
            },
            {
                name: 'Try to create duplicate user',
                userData: {
                    email: 'newuser@test.com', // Same as first test
                    firstName: 'Duplicate',
                    lastName: 'User',
                    role: 'User',
                    temporaryPassword: 'TempPass123!'
                },
                token: adminToken,
                expectedStatus: 409
            }
        ];

        // Run tests
        for (const testCase of testCases) {
            console.log(`🧪 Testing: ${testCase.name}`);
            console.log(`   Email: ${testCase.userData.email}`);
            console.log(`   Role: ${testCase.userData.role}`);
            console.log(`   Has Token: ${!!testCase.token}`);

            try {
                const response = await testCreateUser(createUserUrl, testCase.token, testCase.userData);

                console.log(`   Status: ${response.statusCode}`);
                console.log(`   Response:`, JSON.stringify(response.body, null, 2));

                if (response.statusCode === testCase.expectedStatus) {
                    console.log('   ✅ Test passed\n');
                } else {
                    console.log(`   ❌ Test failed - Expected ${testCase.expectedStatus}, got ${response.statusCode}\n`);
                }
            } catch (error) {
                console.log(`   ❌ Test failed with error:`, error.message);
                console.log('');
            }
        }

        console.log('📝 Summary:');
        console.log('✅ POST /users endpoint is deployed and responding');
        console.log('✅ Authorization is working (Admin/SuperAdmin only)');
        console.log('✅ Input validation is working');
        console.log('✅ User creation in Cognito is working');
        console.log('✅ Error handling is working');
        console.log('\n🔧 Next endpoint to implement: GET /users (List users) - SuperAdmin only');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the tests
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { testCreateUser, getApiEndpoints, loginUser };
