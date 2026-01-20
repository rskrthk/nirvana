export const API_ROOT = 'https://apiservices.nirvaanayoga.com:8443';

export const OTP_ENDPOINT = `${API_ROOT}/api/v1/otp/send-otp`;
export const OTP_VERIFY_ENDPOINT = `${API_ROOT}/api/v1/otp/verify-otp`;
export const ONLINE_USER_CREATE_ENDPOINT = `${API_ROOT}/api/v1/users/online/create`;

// Add your Google OAuth client id here for web sign-in. Replace with your real client id.
export const GOOGLE_CLIENT_ID = "84582538205-03gdcucanamjov80espi88bgkcfkmgel.apps.googleusercontent.com";

export const VIDEO_STREAM_ENDPOINT_BASE = `${API_ROOT}/api/v1/videos/stream`;
export const FREE_ASANA_CODES_ENDPOINT = `${VIDEO_STREAM_ENDPOINT_BASE}/free-asana-codes`;

export const EXTERNAL_ONLINE_USER_UPDATE = `${API_ROOT}/api/v1/users`;
export const EXTERNAL_GENERATE_ASANA_PLAN = `${API_ROOT}/api/v1/users/generate-asana-plan`;
export const GET_ASANA_PLAN = `${API_ROOT}/api/v1/users/get-asana-plan`;
export const GET_MOBILE_ASANA_PLAN = `${API_ROOT}/api/v1/users/get-mobile-asana-plan`;
export const OAUTH_SIGNIN_ENDPOINT = `${API_ROOT}/api/v1/oauth/signin`;
export const SESSION_TIMESTAMP_KEY = "sessionTimestamp";
export const ASANA_PLAN_CACHE_KEY = "latestAsanaPlan";
export const LINKEDIN_CLIENT_ID = "86vsc64l7ygk4q";
export const LINKEDIN_REDIRECT_URI = "http://localhost:3000" ; 
export const LINKEDIN_OAUTH_ENDPOINT = "https://www.linkedin.com/oauth/v2/authorization";

