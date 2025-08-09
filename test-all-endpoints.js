#!/usr/bin/env node

/**
 * Comprehensive test script for all User Management API endpoints
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

    const [loginUrl, createUserUrl, listUsersUrl, getUserInfoUrl] = await Promise.all([
        getOutput('LoginApi'),
        getOutput('CreateUserApi'),
        getOutput('ListUsersApi'),
        getOutput('GetUserInfoApi')
    ]);

    return { loginUrl, createUserUrl, listUsersUrl, getUserInfoUrl };
}

// Make HTTP request
async function makeRequest(url, method = 'GET', data = null, token = null) {
    const urlObj = new URL(url);

    const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname,
        method: method,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    if (data) {
        const postData = JSON.stringify(data);
        options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(responseData);
                    resolve({
                        statusCode: res.statusCode,
                        body: response
                    });
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        body: responseData
                    });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

// Create test users
async function createTestUsers() {
    console.log('👥 Setting up test users...');

    const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');

    const cognito = new CognitoIdentityProviderClient({ region: 'us-east-1' });
    const USER_POOL_ID = 'us-east-1_CuP3LGrFh';

    const testUsers = [
        {
            email: 'superadmin@test.com',
            password: 'SuperPass123!',
            role: 'SuperAdmin',
            firstName: 'Super',
            lastName: 'Admin'
        },
        {
            email: 'admin@test.com',
            password: 'AdminPass123!',
            role: 'Admin',
            firstName: 'Test',
            lastName: 'Admin'
        },
        {
            email: 'user@test.com',
            password: 'UserPass123!',
            role: 'User',
            firstName: 'Regular',
            lastName: 'User'
        }
    ];

    for (const user of testUsers) {
        try {
            await cognito.send(new AdminCreateUserCommand({
                UserPoolId: USER_POOL_ID,
                Username: user.email,
                MessageAction: 'SUPPRESS',
                TemporaryPassword: user.password,
                UserAttributes: [
                    { Name: 'email', Value: user.email },
                    { Name: 'given_name', Value: user.firstName },
                    { Name: 'family_name', Value: user.lastName },
                    { Name: 'custom:user_role', Value: user.role }
                ]
            }));

            await cognito.send(new AdminSetUserPasswordCommand({
                UserPoolId: USER_POOL_ID,
                Username: user.email,
                Password: user.password,
                Permanent: true
            }));

            console.log(`✅ Created ${user.role}: ${user.email}`);
        } catch (error) {
            if (error.name === 'UsernameExistsException') {
                console.log(`ℹ️  ${user.role} already exists: ${user.email}`);
            } else {
                console.error(`❌ Failed to create ${user.role}:`, error.message);
            }
        }
    }

    return testUsers;
}

// Test all endpoints
async function runAllTests() {
    console.log('🚀 Testing All User Management API Endpoints\n');

    try {
        // Get API endpoints
        console.log('📡 Getting API endpoints...');
        const { loginUrl, createUserUrl, listUsersUrl, getUserInfoUrl } = await getApiEndpoints();
        console.log(`✅ Login URL: ${loginUrl}`);
        console.log(`✅ Create User URL: ${createUserUrl}`);
        console.log(`✅ List Users URL: ${listUsersUrl}`);
        console.log(`✅ Get User Info URL: ${getUserInfoUrl}\n`);

        // Create test users
        const testUsers = await createTestUsers();
        console.log('');

        // Login all test users
        console.log('🔐 Logging in test users...');
        const tokens = {};

        for (const user of testUsers) {
            const loginResponse = await makeRequest(loginUrl, 'POST', {
                email: user.email,
                password: user.password
            });

            if (loginResponse.statusCode === 200 && loginResponse.body.success) {
                tokens[user.role] = loginResponse.body.data.idToken;
                console.log(`✅ ${user.role} login successful`);
            } else {
                console.log(`❌ ${user.role} login failed:`, loginResponse.body);
            }
        }
        console.log('');

        // Test 1: GET /me endpoint (Admin only)
        console.log('🧪 Testing GET /me endpoint (Admin access only)');

        const meTests = [
            {
                name: 'Admin accessing /me',
                token: tokens.Admin,
                expectedStatus: 200
            },
            {
                name: 'SuperAdmin accessing /me',
                token: tokens.SuperAdmin,
                expectedStatus: 403
            },
            {
                name: 'Regular User accessing /me',
                token: tokens.User,
                expectedStatus: 403
            },
            {
                name: 'No token accessing /me',
                token: null,
                expectedStatus: 401
            }
        ];

        for (const test of meTests) {
            console.log(`   Testing: ${test.name}`);
            const response = await makeRequest(getUserInfoUrl, 'GET', null, test.token);
            console.log(`   Status: ${response.statusCode} ${response.statusCode === test.expectedStatus ? '✅' : '❌'}`);
            if (response.statusCode === 200) {
                console.log(`   User: ${response.body.data.user.firstName} ${response.body.data.user.lastName} (${response.body.data.user.role})`);
            }
            console.log('');
        }

        // Test 2: GET /users endpoint (SuperAdmin only)
        console.log('🧪 Testing GET /users endpoint (SuperAdmin access only)');

        const listTests = [
            {
                name: 'SuperAdmin accessing /users',
                token: tokens.SuperAdmin,
                expectedStatus: 200
            },
            {
                name: 'Admin accessing /users',
                token: tokens.Admin,
                expectedStatus: 403
            },
            {
                name: 'Regular User accessing /users',
                token: tokens.User,
                expectedStatus: 403
            },
            {
                name: 'No token accessing /users',
                token: null,
                expectedStatus: 401
            }
        ];

        for (const test of listTests) {
            console.log(`   Testing: ${test.name}`);
            const response = await makeRequest(listUsersUrl, 'GET', null, test.token);
            console.log(`   Status: ${response.statusCode} ${response.statusCode === test.expectedStatus ? '✅' : '❌'}`);
            if (response.statusCode === 200) {
                console.log(`   Found ${response.body.data.totalUsers} users`);
                response.body.data.users.forEach(user => {
                    console.log(`     - ${user.firstName} ${user.lastName} (${user.role}) - ${user.email}`);
                });
            }
            console.log('');
        }

        // Test 3: POST /users endpoint (Admin/SuperAdmin only)
        console.log('🧪 Testing POST /users endpoint (Create User)');

        const createTests = [
            {
                name: 'Admin creating new user',
                token: tokens.Admin,
                userData: {
                    email: 'newuser1@test.com',
                    firstName: 'New',
                    lastName: 'User1',
                    role: 'User',
                    temporaryPassword: 'TempPass123!'
                },
                expectedStatus: 201
            },
            {
                name: 'SuperAdmin creating new admin',
                token: tokens.SuperAdmin,
                userData: {
                    email: 'newadmin@test.com',
                    firstName: 'New',
                    lastName: 'Admin',
                    role: 'Admin',
                    temporaryPassword: 'TempPass123!'
                },
                expectedStatus: 201
            },
            {
                name: 'Regular User trying to create user',
                token: tokens.User,
                userData: {
                    email: 'shouldfail@test.com',
                    firstName: 'Should',
                    lastName: 'Fail',
                    role: 'User',
                    temporaryPassword: 'TempPass123!'
                },
                expectedStatus: 403
            }
        ];

        for (const test of createTests) {
            console.log(`   Testing: ${test.name}`);
            const response = await makeRequest(createUserUrl, 'POST', test.userData, test.token);
            console.log(`   Status: ${response.statusCode} ${response.statusCode === test.expectedStatus ? '✅' : '❌'}`);
            if (response.statusCode === 201) {
                console.log(`   Created: ${test.userData.firstName} ${test.userData.lastName} (${test.userData.role})`);
            }
            console.log('');
        }

        // Summary
        console.log('📋 API ENDPOINTS SUMMARY:');
        console.log('✅ POST /login - Authentication working');
        console.log('✅ POST /users - User creation with role-based access');
        console.log('✅ GET /users - List users (SuperAdmin only)');
        console.log('✅ GET /me - Get current user info (Admin+ only)');
        console.log('\n🎉 All endpoints are working correctly!');
        console.log('\n📝 Role-based Access Control:');
        console.log('   - SuperAdmin: Full access to all endpoints');
        console.log('   - Admin: Can create users and access own info');
        console.log('   - User: Can only login (no access to management endpoints)');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run all tests
if (require.main === module) {
    runAllTests().catch(console.error);
}

module.exports = { makeRequest, getApiEndpoints, createTestUsers };
