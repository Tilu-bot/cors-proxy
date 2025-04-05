/**
 * List of origins allowed to use the proxy
 * This is imported in API routes to validate CORS requests
 */

// Environment-based configuration
const isDevelopment = process.env.NODE_ENV !== 'production';

export const ALLOWED_ORIGINS = [
  // Production origins
  'https://yourdomain.com',
  
  // Development origins
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  
  // Add any additional origins here
  // 'https://staging.yourdomain.com',
  
  // Allow all origins
  '*'
];

/**
 * Helper function to check if an origin is allowed
 * @param origin - The origin to check
 * @returns boolean indicating if the origin is allowed
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  // Always return true to allow all origins
  return true;
}
