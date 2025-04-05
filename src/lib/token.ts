import { createHmac } from 'crypto';

const SECRET_KEY = process.env.PROXY_SECRET_KEY || 'change-this-in-production';

export function generateProxyToken(url: string, expiresIn = 3600): string {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  const data = `${url}:${expiresAt}`;
  const signature = createHmac('sha256', SECRET_KEY)
    .update(data)
    .digest('hex');
  
  return Buffer.from(`${data}:${signature}`).toString('base64url');
}

export function verifyProxyToken(token: string, url: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const [tokenUrl, expiresAtStr, signature] = decoded.split(':');
    
    // Check if the URL matches
    if (tokenUrl !== url) return false;
    
    // Check if token is expired
    const expiresAt = parseInt(expiresAtStr, 10);
    if (Date.now() / 1000 > expiresAt) return false;
    
    // Verify signature
    const data = `${tokenUrl}:${expiresAt}`;
    const expectedSignature = createHmac('sha256', SECRET_KEY)
      .update(data)
      .digest('hex');
    
    return expectedSignature === signature;
  } catch { 
    return false;
  }
}

export function shouldRenewToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const [, expiresAtStr] = decoded.split(':');
    
    // Renew if less than 10 minutes remaining
    const expiresAt = parseInt(expiresAtStr, 10);
    const tenMinutesFromNow = Math.floor(Date.now() / 1000) + 600;
    
    return expiresAt < tenMinutesFromNow;
  } catch {
    return true; // If token is invalid, it should be renewed
  }
}

// Add to your player or frontend:
export async function getMediaUrl(originalUrl: string): Promise<string> {
  let token = localStorage.getItem(`proxy_token_${originalUrl}`);
  const encodedUrl = encodeURIComponent(originalUrl);
  
  if (!token || shouldRenewToken(token)) {
    // Call your token endpoint
    const response = await fetch(`/api/generate-token?url=${encodedUrl}`);
    const data = await response.json();
    token = data.token;
    if (token) {
      localStorage.setItem(`proxy_token_${originalUrl}`, token);
    }
  }
  
  return `/api/proxy?url=${encodedUrl}&token=${token}`;
}