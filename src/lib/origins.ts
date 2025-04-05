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
  'http://localhost:3001',  // Add additional local development ports if needed
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  
  // Add any additional development/staging environments here
  // 'https://staging.yourdomain.com',
  
  // WARNING: The following is less secure but convenient for development
  // Remove or comment out for production deployments
  ...(isDevelopment ? ['*'] : []),  // Allow all origins in development mode
];

/**
 * Helper function to check if an origin is allowed
 * @param origin - The origin to check
 * @returns boolean indicating if the origin is allowed
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes('*')) return true;
  return ALLOWED_ORIGINS.includes(origin);
}
