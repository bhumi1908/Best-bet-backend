# Best-Bet Backend API

A robust Node.js + Express backend API with PostgreSQL, JWT authentication, Cloudinary file uploads, and comprehensive security features.

## Features

- ✅ **Express.js** web framework
- ✅ **PostgreSQL** database with connection pooling
- ✅ **JWT Authentication** with secure token management
- ✅ **File Upload** via Multer with Cloudinary integration
- ✅ **Input Validation** using Joi schemas
- ✅ **Rate Limiting** to prevent abuse
- ✅ **CORS** support for cross-origin requests
- ✅ **Security** middleware (Helmet)
- ✅ **Error Handling** with centralized error middleware
- ✅ **TypeScript** for type safety
- ✅ **Modular Architecture** for maintainability

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **PostgreSQL** (v12 or higher)
- **npm** or **yarn**
- **Cloudinary Account** (for file uploads)

## Installation

1. **Clone the repository** (if applicable) or navigate to the project directory:
   ```bash
   cd "Best-Best BE"
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```

4. **Configure your `.env` file** with your actual values:
   ```env
   # Server Configuration
   NODE_ENV=development
   PORT=3001

   # Database Configuration (PostgreSQL)
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=your_actual_password
   DB_NAME=best_bet_db

   # JWT Configuration
   JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
   JWT_EXPIRES_IN=2h

   # Cloudinary Configuration
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret

   # CORS Configuration
   CORS_ORIGIN=http://localhost:3001

   # Rate Limiting
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100
   ```

5. **Set up PostgreSQL database**:
   ```sql
   CREATE DATABASE best_bet_db;
   ```
   
   The application will automatically create the required tables (`users` and `uploads`) on first run.

## Running the Application

### Development Mode

```bash
npm run dev
```

The server will start on `http://localhost:3001` (or the port specified in your `.env` file).

### Production Mode

1. **Build the TypeScript code**:
   ```bash
   npm run build
   ```

2. **Start the server**:
   ```bash
   npm start
   ```

## API Endpoints

### Public Endpoints

#### Health Check
- **GET** `/healthcheck`
  - Returns server status
  - No authentication required

#### Authentication

- **POST** `/api/auth/register`
  - Register a new user
  - **Body:**
    ```json
    {
      "email": "user@example.com",
      "password": "password123",
      "name": "John Doe" // optional
    }
    ```
  - **Response:**
    ```json
    {
      "status": "success",
      "message": "User registered successfully",
      "data": {
        "user": {
          "id": 1,
          "email": "user@example.com",
          "name": "John Doe"
        },
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      }
    }
    ```

- **POST** `/api/auth/login`
  - Login with email and password
  - **Body:**
    ```json
    {
      "email": "user@example.com",
      "password": "password123"
    }
    ```
  - **Response:**
    ```json
    {
      "status": "success",
      "message": "Login successful",
      "data": {
        "user": {
          "id": 1,
          "email": "user@example.com",
          "name": "John Doe"
        },
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      }
    }
    ```

### Protected Endpoints

All protected endpoints require an `Authorization` header:
```
Authorization: Bearer <your_jwt_token>
```

#### User Profile

- **GET** `/api/auth/profile`
  - Get authenticated user's profile
  - **Response:**
    ```json
    {
      "status": "success",
      "message": "Profile retrieved successfully",
      "data": {
        "id": 1,
        "email": "user@example.com",
        "name": "John Doe",
        "created_at": "2024-01-01T00:00:00.000Z"
      }
    }
    ```

#### File Upload

- **POST** `/api/upload`
  - Upload a single file to Cloudinary
  - **Content-Type:** `multipart/form-data`
  - **Body:** Form data with field name `file`
  - **Response:**
    ```json
    {
      "status": "success",
      "message": "File uploaded successfully",
      "data": {
        "id": 1,
        "public_id": "best-bet/xyz123",
        "secure_url": "https://res.cloudinary.com/...",
        "url": "http://res.cloudinary.com/...",
        "resource_type": "image",
        "format": "png",
        "width": 1920,
        "height": 1080,
        "bytes": 245678,
        "created_at": "2024-01-01T00:00:00.000Z"
      }
    }
    ```

- **POST** `/api/upload/multiple`
  - Upload multiple files (up to 5 files)
  - **Content-Type:** `multipart/form-data`
  - **Body:** Form data with field name `files` (array)
  - **Response:**
    ```json
    {
      "status": "success",
      "message": "3 file(s) uploaded successfully",
      "data": {
        "uploads": [...]
      }
    }
    ```

- **GET** `/api/upload`
  - Get all uploads for the authenticated user
  - **Response:**
    ```json
    {
      "status": "success",
      "message": "Uploads retrieved successfully",
      "data": {
        "uploads": [...]
      }
    }
    ```

## Authentication & Authorization Workflow

### Registration Flow

1. User sends POST request to `/api/auth/register` with email, password, and optional name
2. Server validates input using Joi schema
3. Server checks if user already exists
4. Password is hashed using bcrypt
5. User is created in database
6. JWT token is generated and returned with user data

### Login Flow

1. User sends POST request to `/api/auth/login` with email and password
2. Server validates input using Joi schema
3. Server finds user by email
4. Password is verified using bcrypt
5. JWT token is generated and returned with user data

### Protected Route Flow

1. Client includes JWT token in `Authorization` header: `Bearer <token>`
2. `authenticateToken` middleware verifies token signature
3. Middleware extracts user ID from token payload
4. Middleware verifies user still exists in database
5. User object is attached to `req.user`
6. Controller can access `req.user` to get authenticated user info

## File Upload Workflow

1. Client sends multipart/form-data request with file(s)
2. Multer middleware processes the file(s) and stores in memory
3. File is validated (type, size)
4. File is uploaded to Cloudinary via the Cloudinary service
5. Cloudinary returns metadata (URL, dimensions, etc.)
6. Upload metadata is saved to PostgreSQL database
7. Response includes Cloudinary URLs and database record ID

## Project Structure

```
Best-Best BE/
├── src/
│   ├── config/
│   │   └── database.ts          # PostgreSQL connection and initialization
│   ├── middleware/
│   │   ├── auth.ts              # JWT authentication middleware
│   │   ├── errorHandler.ts     # Centralized error handling
│   │   ├── rateLimiter.ts      # Rate limiting configuration
│   │   └── validateDto.ts      # Request validation middleware
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.controller.ts   # Auth business logic
│   │   │   ├── auth.routes.ts        # Auth route definitions
│   │   │   └── auth.validation.ts    # Auth validation schemas
│   │   └── upload/
│   │       ├── upload.controller.ts  # Upload business logic
│   │       └── upload.routes.ts      # Upload route definitions
│   ├── services/
│   │   └── cloudinary/
│   │       ├── cloudinary.service.ts # Cloudinary integration
│   │       └── index.ts
│   ├── types/
│   │   ├── cloudinary.d.ts      # Cloudinary type definitions
│   │   └── express.d.ts         # Express type extensions
│   ├── utils/
│   │   ├── constants/
│   │   │   ├── enums.ts         # Application enums
│   │   │   ├── routes.ts        # Route constants
│   │   │   └── storage.ts        # Storage limits and config
│   │   └── helpers/
│   │       ├── cookie.ts        # Cookie utilities
│   │       ├── date.ts          # Date utilities
│   │       ├── logger.ts        # Logging utilities
│   │       ├── response.ts      # Response helpers
│   │       └── index.ts
│   ├── resources/
│   │   └── images/              # Static image resources
│   └── server.ts                # Express app entry point
├── .env.example                  # Environment variables template
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## Security Features

### Rate Limiting

- **General API:** 100 requests per 15 minutes per IP
- **Authentication endpoints:** 5 requests per 15 minutes per IP
- **Upload endpoints:** 10 requests per hour per IP

### Input Validation

- All request bodies are validated using Joi schemas
- Invalid inputs return detailed error messages
- SQL injection prevention via parameterized queries

### Password Security

- Passwords are hashed using bcrypt with 10 salt rounds
- Passwords are never returned in API responses

### JWT Security

- Tokens include user ID and email
- Tokens expire after configured duration (default: 7 days)
- Tokens are verified on every protected route request
- User existence is verified on each request

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NODE_ENV` | Environment mode | No | `development` |
| `PORT` | Server port | No | `3001` |
| `DB_HOST` | PostgreSQL host | Yes | `localhost` |
| `DB_PORT` | PostgreSQL port | No | `5432` |
| `DB_USER` | PostgreSQL user | Yes | - |
| `DB_PASSWORD` | PostgreSQL password | Yes | - |
| `DB_NAME` | Database name | Yes | - |
| `JWT_SECRET` | Secret key for JWT signing | Yes | - |
| `JWT_EXPIRES_IN` | JWT expiration time | No | `7d` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | Yes | - |
| `CLOUDINARY_API_KEY` | Cloudinary API key | Yes | - |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | Yes | - |
| `CORS_ORIGIN` | Allowed CORS origin | No | `http://localhost:3001` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window (ms) | No | `900000` |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | No | `100` |

## Database Schema

### Users Table

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Uploads Table

```sql
CREATE TABLE uploads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  cloudinary_public_id VARCHAR(255) NOT NULL,
  cloudinary_url TEXT NOT NULL,
  cloudinary_secure_url TEXT NOT NULL,
  resource_type VARCHAR(50),
  format VARCHAR(50),
  width INTEGER,
  height INTEGER,
  bytes INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Error Handling

The API uses a centralized error handling middleware that:

- Catches all errors and exceptions
- Returns consistent error response format
- Logs errors in development mode
- Prevents sensitive error details from leaking in production

Error response format:
```json
{
  "status": "error",
  "message": "Error message here"
}
```

## Testing the API

### Using cURL

**Register a user:**
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'
```

**Login:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

**Get profile (replace TOKEN with actual token):**
```bash
curl -X GET http://localhost:3001/api/auth/profile \
  -H "Authorization: Bearer TOKEN"
```

**Upload file (replace TOKEN with actual token):**
```bash
curl -X POST http://localhost:3001/api/upload \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@/path/to/your/image.jpg"
```

## Troubleshooting

### Database Connection Issues

- Ensure PostgreSQL is running
- Verify database credentials in `.env`
- Check if database exists: `CREATE DATABASE best_bet_db;`

### Cloudinary Upload Failures

- Verify Cloudinary credentials in `.env`
- Check file size (max 10MB)
- Ensure file type is allowed (images, videos, PDFs)

### JWT Token Issues

- Ensure `JWT_SECRET` is set in `.env`
- Check token expiration time
- Verify token is included in `Authorization` header with `Bearer` prefix

## Development

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run lint` - Run ESLint

### Adding New Modules

1. Create a new folder in `src/modules/`
2. Add `controller.ts`, `routes.ts`, and `validation.ts` files
3. Import and use routes in `src/server.ts`

## License

ISC

## Support

For issues and questions, please open an issue in the repository.

