import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors, { CorsOptions } from 'cors';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/user/user.routes';
import { API_ROUTES } from './utils/constants/routes';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const defaultOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use(rateLimiter);
app.use(cookieParser());
// API Routes
app.use(API_ROUTES.AUTH.BASE, authRoutes);
app.use(API_ROUTES.USER.BASE, userRoutes);

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