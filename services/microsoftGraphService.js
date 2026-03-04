/**
 * Microsoft Graph Service
 * Handles OAuth2 authentication, subscriptions, and file operations with Microsoft Graph API
 * 
 * Uses ONEDRIVE_RESOURCE environment variable as the complete Graph API URL for the file
 * Example: https://graph.microsoft.com/v1.0/drives/b!.../root:/path/file.xlsx
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
    throw new Error('Missing required environment variables: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET');
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
 * Gets file metadata from OneDrive using ONEDRIVE_RESOURCE
 * @returns {Promise<Object>} File metadata
 */
export async function getFileMetadata() {
  const onedriveResource = process.env.ONEDRIVE_RESOURCE;
  
  if (!onedriveResource) {
    throw new Error('ONEDRIVE_RESOURCE environment variable is not set');
  }

  const accessToken = await getAccessToken();

  try {
    const response = await fetch(onedriveResource, {
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
 * Downloads a file from OneDrive using ONEDRIVE_RESOURCE
 * @returns {Promise<Buffer>} File content as Buffer
 */
export async function downloadFileFromOneDrive() {
  const onedriveResource = process.env.ONEDRIVE_RESOURCE;
  
  if (!onedriveResource) {
    throw new Error('ONEDRIVE_RESOURCE environment variable is not set');
  }

  const accessToken = await getAccessToken();

  // Append /content to the resource URL to download the file
  const downloadUrl = `${onedriveResource}/content`;

  try {
    const response = await fetch(downloadUrl, {
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

    console.log(`✅ File downloaded (${buffer.length} bytes)`);
    return buffer;
  } catch (error) {
    console.error('❌ Error downloading file:', error.message);
    throw error;
  }
}

/**
 * Gets the subscription resource path from file metadata
 * Extracts driveId and itemId to construct: drives/{driveId}/items/{itemId}
 * @param {Object} metadata - File metadata from getFileMetadata()
 * @returns {string} Resource path for subscription
 */
function getSubscriptionResourcePath(metadata) {
  if (!metadata.id) {
    throw new Error('File metadata does not contain an id');
  }

  if (!metadata.parentReference || !metadata.parentReference.driveId) {
    throw new Error('File metadata does not contain parentReference.driveId');
  }

  const driveId = metadata.parentReference.driveId;
  const itemId = metadata.id;

  return `drives/${driveId}/items/${itemId}`;
}

/**
 * Creates a subscription in Microsoft Graph for OneDrive file changes
 * Uses ONEDRIVE_RESOURCE to get file metadata and constructs subscription resource
 * @param {string} webhookUrl - URL where notifications will be sent
 * @param {string} clientState - Optional client state for validation
 * @returns {Promise<Object>} Subscription object
 */
export async function createSubscription(webhookUrl, clientState = null) {
  const accessToken = await getAccessToken();

  // Get file metadata to extract driveId and itemId
  console.log('📋 Getting file metadata to construct subscription resource...');
  const metadata = await getFileMetadata();
  
  // Construct subscription resource path: drives/{driveId}/items/{itemId}
  const resourcePath = getSubscriptionResourcePath(metadata);
  console.log(`✅ Using subscription resource: ${resourcePath}`);

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
