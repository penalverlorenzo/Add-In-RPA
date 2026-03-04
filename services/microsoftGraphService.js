/**
 * Microsoft Graph Service
 * Handles OAuth2 authentication, subscriptions, and file operations with Microsoft Graph API
 */

/**
 * Gets access token using OAuth2 Client Credentials flow
 * @returns {Promise<string>} Access token
 */
export async function getAccessToken() {
  const tenantId = process.env.TENANT_ID;
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;

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
 * @param {string} resource - Resource to subscribe to (e.g., "users/{user-id}/drive/root:/carpeta/archivo.xlsx")
 * @param {string} webhookUrl - URL where notifications will be sent
 * @param {string} clientState - Optional client state for validation
 * @returns {Promise<Object>} Subscription object
 */
export async function createSubscription(resource, webhookUrl, clientState = null) {
  const accessToken = await getAccessToken();

  const subscriptionData = {
    changeType: 'created,updated',
    notificationUrl: webhookUrl,
    resource: resource,
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
 * @param {string} filePath - Path to the file
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
