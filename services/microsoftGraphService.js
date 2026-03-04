/**
 * Microsoft Graph Service
 * Handles OAuth2 authentication, subscriptions, and file operations with Microsoft Graph API
 * 
 * Uses ONEDRIVE_RESOURCE environment variable as the complete Graph API URL for the file
 * Example: https://graph.microsoft.com/v1.0/drives/b!.../root:/path/file.xlsx
 * 
 * IMPORTANT: For OneDrive Business subscriptions with app-only (client_credentials),
 * subscriptions ONLY work with: drives/{driveId}/root
 * They do NOT work with: drives/{driveId}/items/{itemId}, file paths, or individual files
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
 * Gets the drive root resource path for subscriptions
 * OneDrive Business subscriptions with app-only authentication ONLY work with: drives/{driveId}/root
 * @returns {Promise<string>} Resource path: drives/{driveId}/root
 */
export async function getDriveRootResource() {
  console.log('📋 Getting file metadata to extract driveId...');
  const metadata = await getFileMetadata();
  
  if (!metadata.parentReference || !metadata.parentReference.driveId) {
    throw new Error('File metadata does not contain parentReference.driveId');
  }

  const driveId = metadata.parentReference.driveId;
  const resourcePath = `drives/${driveId}/root`;
  
  console.log(`✅ Drive root resource: ${resourcePath}`);
  return resourcePath;
}

/**
 * Creates a subscription in Microsoft Graph for OneDrive file changes
 * Subscriptions MUST use drives/{driveId}/root (not individual files or items)
 * File filtering will be done in the webhook handler
 * @param {string} webhookUrl - URL where notifications will be sent
 * @param {string} clientState - Optional client state for validation
 * @returns {Promise<Object>} Subscription object
 */
export async function createSubscription(webhookUrl, clientState = null) {
  const accessToken = await getAccessToken();

  // Get drive root resource path (drives/{driveId}/root)
  const resourcePath = await getDriveRootResource();
  console.log(`📝 Creating subscription for resource: ${resourcePath}`);

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
    console.log(`   Resource: ${subscription.resource}`);
    console.log(`   Expires: ${subscription.expirationDateTime}`);
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
 * Gets file metadata by item ID from a drive
 * Used by webhook to get file details when processing notifications
 * @param {string} driveId - Drive ID
 * @param {string} itemId - Item ID
 * @returns {Promise<Object>} File metadata
 */
export async function getFileMetadataByItemId(driveId, itemId) {
  const accessToken = await getAccessToken();
  const fileUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}`;

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
    console.error('❌ Error getting file metadata by item ID:', error.message);
    throw error;
  }
}
