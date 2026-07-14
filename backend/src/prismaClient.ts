import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { createActivityLogExtension } from './audit/activityLogExtension';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const basePrisma = new PrismaClient({ adapter });

export const prisma = basePrisma.$extends(createActivityLogExtension(basePrisma));
