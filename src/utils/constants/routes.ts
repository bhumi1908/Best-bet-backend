export const API_ROUTES = {
  AUTH: {
    BASE: '/api/auth',
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    PROFILE: '/api/auth/profile',
    FORGOTPASS: '/api/auth/forgot-password',
    RESETPASS: '/api/auth/reset-password'
  },
  UPLOAD: {
    BASE: '/api/upload',
    SINGLE: '/api/upload',
    MULTIPLE: '/api/upload/multiple',
  },
  HEALTH: '/healthcheck',
} as const;

