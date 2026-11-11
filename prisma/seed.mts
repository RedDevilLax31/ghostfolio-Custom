import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL
});

const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.$transaction([
    prisma.tag.createMany({
      data: [
        {
          id: '0c077abd-eca2-4cbb-818c-6cefbf2d169a',
          name: 'DRAFT'
        },
        {
          id: '4452656d-9fa4-4bd0-ba38-70492e31d180',
          name: 'EMERGENCY_FUND'
        },
        {
          id: 'f2e868af-8333-459f-b161-cbc6544c24bd',
          name: 'EXCLUDE_FROM_ANALYSIS'
        }
      ],
      skipDuplicates: true
    }),
    ...[
      {
        id: 'platform-vanguard',
        name: 'Vanguard',
        url: 'https://investor.vanguard.com'
      },
      {
        id: 'platform-fidelity',
        name: 'Fidelity',
        url: 'https://www.fidelity.com'
      },
      {
        id: 'platform-jnj-401k',
        name: 'JNJ 401K',
        url: 'https://www.jnj.com'
      },
      {
        id: 'platform-robinhood',
        name: 'Robinhood',
        url: 'https://robinhood.com'
      },
      {
        id: 'platform-equiniti',
        name: 'Equiniti',
        url: 'https://www.equiniti.com'
      }
    ].map(({ id, name, url }) =>
      prisma.platform.upsert({
        create: { id, name, url },
        update: { name },
        where: { url }
      })
    )
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
