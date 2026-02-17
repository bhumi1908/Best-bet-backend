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
    ADMINBASE: '/api/profile'
  },
  SUBSCRIPTIONPLAN:{
    ADMINBASE: '/api/admin/subscription-plan',
    BASE: '/api/subscription-plan'
  },
  SUBSCRIPTION: {
    BASE: '/api/subscription'
  },
  UPLOAD: {
    BASE: '/api/upload',
    SINGLE: '/api/upload',
    MULTIPLE: '/api/upload/multiple',
  },
  STRIPE: {
    BASE: '/api/stripe'
  },
  STATES: {
    BASE: '/api/states',
  },
  GAME_TYPES: {
    BASE: '/api/game-types',
  },
  GAME_HISTORY: {
    BASE: '/api/game-history',
    HISTORIES: '/api/game-histories'
  },
  DRAW_HISTORY: {
    BASE: '/api/draw-history',
  },
  PREDICTIONS: {
    BASE: '/api/predictions',
    LATEST: '/api/predictions/latest',
  },
  STATE_PERFORMANCE: {
    BASE: '/api/state-performance',
  },
  HEALTH: '/healthcheck',
  WEBHOOK: '/api/webhook'
} as const;

