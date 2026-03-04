/**
 * Microsoft Graph Service
 * Handles OAuth2 authentication, subscriptions, and file operations with Microsoft Graph API
 */

/**
 * Gets access token using OAuth2 Client Credentials flow
 * @returns {Promise<string>} Access token
 */
export async function getAccessToken() {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing required environment variables: TENANT_ID, CLIENT_ID, CLIENT_SECRET');
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('scope', 'https://graph.microsoft.com/.default');
  params.append('grant_type', 'client_credentials');

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get access token: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('❌ Error getting access token:', error.message);
    throw error;
  }
}

/**
 * Creates a subscription in Microsoft Graph for OneDrive file changes
 * @param {string} resource - Resource to subscribe to. Can be:
 *   - File path: "users/{user-id}/drive/root:/carpeta/archivo.xlsx" (will be converted to item-id)
 *   - Item ID path: "users/{user-id}/drive/items/{item-id}" (used directly)
 * @param {string} webhookUrl - URL where notifications will be sent
 * @param {string} clientState - Optional client state for validation
 * @returns {Promise<Object>} Subscription object
 */
export async function createSubscription(resource, webhookUrl, clientState = null) {
  const accessToken = await getAccessToken();

  // Convert file path to item-id based resource if needed
  // Graph subscriptions don't support drive/root:/path format, only items/{id}
  let resourcePath = resource;
  if (resource.includes('/drive/root:/')) {
    console.log('🔄 Converting file path to item-id based resource...');
    resourcePath = await convertFilePathToResourcePath(resource);
    console.log(`✅ Using resource path: ${resourcePath}`);
  }

  const subscriptionData = {
    changeType: 'updated', // For OneDrive files, only 'updated' and 'deleted' are valid, not 'created'
    notificationUrl: webhookUrl,
    resource: resourcePath,
    expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
    clientState: clientState || process.env.CLIENT_STATE_SECRET || 'default-client-state'
  };

  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(subscriptionData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create subscription: ${response.status} ${errorText}`);
    }

    const subscription = await response.json();
    console.log('✅ Subscription created:', subscription.id);
    return subscription;
  } catch (error) {
    console.error('❌ Error creating subscription:', error.message);
    throw error;
  }
}

/**
 * Renews a subscription before it expires
 * @param {string} subscriptionId - ID of the subscription to renew
 * @returns {Promise<Object>} Updated subscription object
 */
export async function renewSubscription(subscriptionId) {
  const accessToken = await getAccessToken();

  const renewalData = {
    expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days from now
  };

  try {
    const response = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(renewalData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to renew subscription: ${response.status} ${errorText}`);
    }

    const subscription = await response.json();
    console.log('✅ Subscription renewed:', subscription.id);
    return subscription;
  } catch (error) {
    console.error('❌ Error renewing subscription:', error.message);
    throw error;
  }
}

/**
 * Lists all active subscriptions
 * @returns {Promise<Array>} Array of subscription objects
 */
export async function listSubscriptions() {
  const accessToken = await getAccessToken();

  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list subscriptions: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.error('❌ Error listing subscriptions:', error.message);
    throw error;
  }
}

/**
 * Deletes a subscription
 * @param {string} subscriptionId - ID of the subscription to delete
 * @returns {Promise<void>}
 */
export async function deleteSubscription(subscriptionId) {
  const accessToken = await getAccessToken();

  try {
    const response = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete subscription: ${response.status} ${errorText}`);
    }

    console.log('✅ Subscription deleted:', subscriptionId);
  } catch (error) {
    console.error('❌ Error deleting subscription:', error.message);
    throw error;
  }
}

/**
 * Downloads a file from OneDrive using Microsoft Graph API
 * @param {string} filePath - Path to the file (e.g., "users/{user-id}/drive/root:/carpeta/archivo.xlsx")
 * @returns {Promise<Buffer>} File content as Buffer
 */
export async function downloadFileFromOneDrive(filePath) {
  const accessToken = await getAccessToken();

  // Construct the Graph API URL for downloading the file
  const fileUrl = `https://graph.microsoft.com/v1.0/${filePath}/content`;

  try {
    const response = await fetch(fileUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to download file: ${response.status} ${errorText}`);
    }

    // Get file as array buffer and convert to Buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`✅ File downloaded: ${filePath} (${buffer.length} bytes)`);
    return buffer;
  } catch (error) {
    console.error('❌ Error downloading file:', error.message);
    throw error;
  }
}

/**
 * Gets file metadata from OneDrive
 * @param {string} filePath - Path to the file (can be path or item-id based)
 * @returns {Promise<Object>} File metadata
 */
export async function getFileMetadata(filePath) {
  const accessToken = await getAccessToken();

  const fileUrl = `https://graph.microsoft.com/v1.0/${filePath}`;

  try {
    const response = await fetch(fileUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get file metadata: ${response.status} ${errorText}`);
    }

    const metadata = await response.json();
    return metadata;
  } catch (error) {
    console.error('❌ Error getting file metadata:', error.message);
    throw error;
  }
}

/**
 * Gets the item-id of a file from its path
 * Microsoft Graph subscriptions require item-id, not file paths
 * @param {string} filePath - Path to the file (e.g., "users/{id}/drive/root:/folder/file.xlsx")
 * @returns {Promise<string>} Item ID of the file
 */
export async function getFileItemId(filePath) {
  try {
    const metadata = await getFileMetadata(filePath);
    
    if (!metadata.id) {
      throw new Error('File metadata does not contain an id');
    }
    
    console.log(`✅ File item-id obtained: ${metadata.id} for path: ${filePath}`);
    return metadata.id;
  } catch (error) {
    console.error('❌ Error getting file item-id:', error.message);
    throw error;
  }
}

/**
 * Converts a file path to a resource path using item-id
 * This is required because Graph subscriptions don't support drive/root:/path format
 * @param {string} filePath - Path to the file (e.g., "users/{id}/drive/root:/folder/file.xlsx")
 * @returns {Promise<string>} Resource path using item-id (e.g., "users/{id}/drive/items/{item-id}")
 */
export async function convertFilePathToResourcePath(filePath) {
  // If the path already uses items/{id} format, return as is
  if (filePath.includes('/drive/items/')) {
    return filePath;
  }
  
  // Extract user ID from path
  const userMatch = filePath.match(/users\/([^/]+)/);
  if (!userMatch) {
    throw new Error('Invalid file path format. Expected: users/{id}/drive/root:/path');
  }
  
  const userId = userMatch[1];
  
  // Get item-id from file path
  const itemId = await getFileItemId(filePath);
  
  // Return resource path using item-id
  return `users/${userId}/drive/items/${itemId}`;
}
