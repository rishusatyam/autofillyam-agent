import { PrismaClient } from '@prisma/client';

// Singleton pattern — reuse one Prisma client across the entire app
// Avoids exhausting the DB connection pool on repeated imports
const prisma = new PrismaClient();

export default prisma;
