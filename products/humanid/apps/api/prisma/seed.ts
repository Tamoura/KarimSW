/**
 * Seed script for HumanID development database.
 *
 * Creates test users across all roles so developers can immediately
 * test API endpoints without manual account creation.
 *
 * Usage: npx tsx prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 12;

async function main() {
  console.log('Seeding HumanID database...');

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

  const users = [
    { email: 'holder@test.com', role: 'HOLDER' as const },
    { email: 'issuer@test.com', role: 'ISSUER' as const },
    { email: 'developer@test.com', role: 'DEVELOPER' as const },
    { email: 'admin@test.com', role: 'ADMIN' as const },
  ];

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash,
        role: u.role,
        emailVerified: true,
      },
    });
    console.log(`  ${u.role}: ${user.email} (id: ${user.id})`);
  }

  console.log(`\nDone. All test accounts use password: ${TEST_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
