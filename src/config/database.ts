// import dotenv from 'dotenv';
// import { PrismaPg } from '@prisma/adapter-pg';
// import { PrismaClient } from '@prisma/client';
// import { Pool } from 'pg';

// dotenv.config();

// // Set DATABASE_URL if not already set (construct from individual DB_* vars)
// if (!process.env.DATABASE_URL) {
//   const host = process.env.DB_HOST || 'localhost';
//   const port = process.env.DB_PORT || '5432';
//   const user = process.env.DB_USER || 'postgres';
//   const password = process.env.DB_PASSWORD || '';
//   const database = process.env.DB_NAME || 'best_bet';

  
//   const encodedPassword = encodeURIComponent(password);
//   process.env.DATABASE_URL = `postgresql://${user}:${encodedPassword}@${host}:${port}/${database}?schema=public`;
// }


// const adapter = new PrismaPg({
//   connectionString: process.env.DATABASE_URL!,
// });

// export const prisma = new PrismaClient({ adapter });

// console.log('prisma', prisma)

// // PrismaClient is attached to the `global` object in development to prevent
// // exhausting your database connection limit.
// // Learn more: https://pris.ly/d/help/next-js-best-practices

// // Initialize database connection
// export const initializeDatabase = async () => {

// };

// export default prisma;
