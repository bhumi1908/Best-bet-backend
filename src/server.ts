import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors, { CorsOptions } from 'cors';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/admin/user/user.routes';
import supportRoutes from './modules/support/support.routes';
import profileRoutes from './modules/admin/profile/profile.routes';
import subscriptionPlanRoutes from './modules/subscription-plans/subscription-plan.routes';
import subscriptionPlanAdminRoutes from './modules/admin/subscription-plans/subscription-plan.routes';
import subscriptionRoutes from './modules/subscription/subscription.routes'
import stripeRoutes from './modules/stripe/stripe.routes'
import webhookRoutes from './webhook/webhook.routes'
import { gameHistoryRouter, gameHistoriesRouter } from './modules/game-history/game-history.routes'
import statesRoutes from './modules/states/states.routes'
import gameTypesRoutes from './modules/game-types/game-types.routes'
import drawHistoryRoutes from './modules/draw-history/draw-history.routes'
import { API_ROUTES } from './utils/constants/routes';
import "./cron/subscriptionExpire.cron";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const defaultOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://best-bet-frontend.vercel.app'];
const allowedOrigins = corsOrigins.length ? corsOrigins : defaultOrigins;


//Set here specifie origin 
const corsOptions: CorsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(API_ROUTES.WEBHOOK, express.raw({ type: "application/json" }),webhookRoutes);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
// app.use(rateLimiter);
app.use(cookieParser());
// API Routes
app.use(API_ROUTES.AUTH.BASE, authRoutes);
app.use(API_ROUTES.USER.BASE, userRoutes);
app.use(API_ROUTES.SUPPORT.BASE, supportRoutes);
app.use(API_ROUTES.PROFILE.ADMINBASE, profileRoutes);
app.use(API_ROUTES.SUBSCRIPTIONPLAN.BASE, subscriptionPlanRoutes);
app.use(API_ROUTES.SUBSCRIPTIONPLAN.ADMINBASE, subscriptionPlanAdminRoutes);
app.use(API_ROUTES.SUBSCRIPTION.BASE, subscriptionRoutes);
app.use(API_ROUTES.STRIPE.BASE, stripeRoutes);
app.use(API_ROUTES.STATES.BASE, statesRoutes);
app.use(API_ROUTES.GAME_TYPES.BASE, gameTypesRoutes);
app.use(API_ROUTES.GAME_HISTORY.BASE, gameHistoryRouter);
app.use(API_ROUTES.GAME_HISTORY.HISTORIES, gameHistoriesRouter);
app.use(API_ROUTES.DRAW_HISTORY.BASE, drawHistoryRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found',
  });
});

app.use(errorHandler);


// Starting the server
const startServer = () => {
  console.log('Database connected successfully');

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

startServer();

export default app;