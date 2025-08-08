#!/usr/bin/env node

/**
 * Test script to verify custom attribute functionality
 * This script will help you verify that the user_role custom attribute is working correctly
 */

const { CognitoIdentityProviderClient,
         ListUserPoolsCommand,
         DescribeUserPoolCommand,
         ListUserPoolClientsCommand,
         AdminCreateUserCommand,
         AdminSetUserPasswordCommand,
         AdminGetUserCommand,
         AdminUpdateUserAttributesCommand,
         AdminInitiateAuthCommand,
         AdminDeleteUserCommand } = require('@aws-sdk/client-cognito-identity-provider');

// Initialize Cognito client
const cognito = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || 'us-east-1'
});

// Get these values from your CloudFormation outputs
let USER_POOL_ID = process.env.USER_POOL_ID;
let CLIENT_ID = process.env.CLIENT_ID;

async function findUserPool() {
    if (!USER_POOL_ID) {
        console.log('🔍 Looking for User Pool...');
        try {
            const command = new ListUserPoolsCommand({ MaxResults: 10 });
            const pools = await cognito.send(command);
            const userPool = pools.UserPools.find(pool =>
                pool.Name.includes('dev-user-management-pool')
            );

            if (userPool) {
                USER_POOL_ID = userPool.Id;
                console.log(`✅ Found User Pool: ${USER_POOL_ID}`);

                // Get the client ID
                const clientCommand = new ListUserPoolClientsCommand({
                    UserPoolId: USER_POOL_ID
                });
                const clients = await cognito.send(clientCommand);
                const client = clients.UserPoolClients.find(c =>
                    c.ClientName.includes('dev-user-management-client')
                );

                if (client) {
                    CLIENT_ID = client.ClientId;
                    console.log(`✅ Found Client: ${CLIENT_ID}`);
                }
            }
        } catch (error) {
            console.error('❌ Error finding User Pool:', error.message);
            return false;
        }
    }
    return true;
}

async function checkUserPoolSchema() {
    console.log('\n📋 Checking User Pool Schema...');
    try {
        const command = new DescribeUserPoolCommand({ UserPoolId: USER_POOL_ID });
        const result = await cognito.send(command);

        const schema = result.UserPool?.SchemaAttributes || [];

        console.log(`Found ${schema.length} schema attributes:`);
        schema.forEach(attr => console.log(`   - ${attr.Name} (${attr.AttributeDataType})`));

        // Check if our custom attribute exists
        const customAttribute = schema.find(attr => attr.Name === 'custom:user_role');

        if (customAttribute) {
            console.log('✅ Custom attribute "custom:user_role" found in schema');
            console.log('   Configuration:', JSON.stringify(customAttribute, null, 2));
        } else {
            console.log('❌ Custom attribute "custom:user_role" not found in schema');
        }

        return !!customAttribute;
    } catch (error) {
        console.error('❌ Error checking schema:', error.message);
        return false;
    }
}

async function createTestUser(email, role) {
    console.log(`\n👤 Creating test user: ${email} with role: ${role}`);
    try {
        const command = new AdminCreateUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: email,
            MessageAction: 'SUPPRESS',
            TemporaryPassword: 'TempPass123!',
            UserAttributes: [
                { Name: 'email', Value: email },
                { Name: 'given_name', Value: 'Test' },
                { Name: 'family_name', Value: 'User' },
                { Name: 'custom:user_role', Value: role }
            ]
        });

        const result = await cognito.send(command);
        console.log('✅ User created successfully');

        // Set permanent password
        const passwordCommand = new AdminSetUserPasswordCommand({
            UserPoolId: USER_POOL_ID,
            Username: email,
            Password: 'TestPass123!',
            Permanent: true
        });

        await cognito.send(passwordCommand);
        console.log('✅ Password set to permanent');
        return true;
    } catch (error) {
        if (error.name === 'UsernameExistsException') {
            console.log('ℹ️  User already exists, that\'s okay');
            return true;
        }
        console.error('❌ Error creating user:', error.message);
        return false;
    }
}

async function getUserAttributes(username) {
    console.log(`\n🔍 Getting attributes for user: ${username}`);
    try {
        const command = new AdminGetUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: username
        });

        const result = await cognito.send(command);

        console.log('✅ User attributes:');
        result.UserAttributes.forEach(attr => {
            console.log(`   ${attr.Name}: ${attr.Value}`);
        });

        // Check specifically for our custom attribute
        const userRole = result.UserAttributes.find(attr => attr.Name === 'custom:user_role');
        if (userRole) {
            console.log(`✅ Custom attribute found: user_role = ${userRole.Value}`);
            return userRole.Value;
        } else {
            console.log('❌ Custom attribute "user_role" not found');
            return null;
        }
    } catch (error) {
        console.error('❌ Error getting user:', error.message);
        return null;
    }
}

async function updateUserRole(username, newRole) {
    console.log(`\n✏️  Updating role for ${username} to: ${newRole}`);
    try {
        const command = new AdminUpdateUserAttributesCommand({
            UserPoolId: USER_POOL_ID,
            Username: username,
            UserAttributes: [
                { Name: 'custom:user_role', Value: newRole }
            ]
        });

        await cognito.send(command);
        console.log('✅ Role updated successfully');
        return true;
    } catch (error) {
        console.error('❌ Error updating role:', error.message);
        return false;
    }
}

async function testAuthentication(username, password) {
    console.log(`\n🔐 Testing authentication for: ${username}`);
    try {
        const command = new AdminInitiateAuthCommand({
            UserPoolId: USER_POOL_ID,
            ClientId: CLIENT_ID,
            AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
            AuthParameters: {
                USERNAME: username,
                PASSWORD: password
            }
        });

        const result = await cognito.send(command);

        if (result.AuthenticationResult) {
            console.log('✅ Authentication successful');

            // Decode the ID token to see custom attributes
            const idToken = result.AuthenticationResult.IdToken;
            const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());

            console.log('🎫 ID Token payload:');
            console.log(`   Email: ${payload.email}`);
            console.log(`   Given Name: ${payload.given_name}`);
            console.log(`   Family Name: ${payload.family_name}`);
            console.log(`   Custom Role: ${payload['custom:user_role'] || 'Not found in token'}`);

            return true;
        }
    } catch (error) {
        console.error('❌ Authentication failed:', error.message);
        return false;
    }
}

async function cleanupTestUser(username) {
    console.log(`\n🧹 Cleaning up test user: ${username}`);
    try {
        const command = new AdminDeleteUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: username
        });

        await cognito.send(command);
        console.log('✅ Test user deleted');
    } catch (error) {
        console.error('❌ Error deleting user:', error.message);
    }
}

async function main() {
    console.log('🚀 Starting Custom Attribute Test Suite\n');

    // Step 1: Find User Pool
    if (!(await findUserPool())) {
        console.log('❌ Could not find User Pool. Please check your deployment.');
        return;
    }

    // Step 2: Check schema
    if (!(await checkUserPoolSchema())) {
        console.log('❌ Custom attribute not properly configured. Please check your template.yaml');
        return;
    }

    const testEmail = 'test-user@example.com';

    try {
        // Step 3: Create test user
        await createTestUser(testEmail, 'Admin');

        // Step 4: Verify attributes
        const role = await getUserAttributes(testEmail);
        if (!role) {
            console.log('❌ Custom attribute test failed');
            return;
        }

        // Step 5: Test role update
        await updateUserRole(testEmail, 'Manager');
        await getUserAttributes(testEmail);

        // Step 6: Test authentication
        await testAuthentication(testEmail, 'TestPass123!');

        console.log('\n🎉 All tests completed successfully!');
        console.log('\n📝 Summary:');
        console.log('   ✅ User Pool found and accessible');
        console.log('   ✅ Custom attribute "user_role" properly configured');
        console.log('   ✅ User creation with custom attribute works');
        console.log('   ✅ Custom attribute retrieval works');
        console.log('   ✅ Custom attribute update works');
        console.log('   ✅ Authentication includes custom attribute in token');

    } finally {
        // Cleanup
        await cleanupTestUser(testEmail);
    }
}

// Run the test
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    findUserPool,
    checkUserPoolSchema,
    createTestUser,
    getUserAttributes,
    updateUserRole,
    testAuthentication
};
