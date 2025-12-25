export const API_ROUTES = {
  AUTH: {
    BASE: '/api/auth',
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    PROFILE: '/api/auth/profile',
    FORGOTPASS: '/api/auth/forgot-password',
    RESETPASS: '/api/auth/reset-password'
  },
  USER: {
    BASE: '/api/users',
    GET_ALL: '/api/users',
    UPDATE: '/api/users/:id',
  },
  SUPPORT: {
    BASE: '/api/support',
    CREATE: '/api/support/create',
  },
  PROFILE: {
    ADMINBASE: '/api/admin/profile'
  },
  SUBSCRIPTIONPLAN:{
    ADMINBASE: '/api/admin/subscription-plan',
    BASE: '/api/subscription-plan'
  },
  UPLOAD: {
    BASE: '/api/upload',
    SINGLE: '/api/upload',
    MULTIPLE: '/api/upload/multiple',
  },
  HEALTH: '/healthcheck',
} as const;

