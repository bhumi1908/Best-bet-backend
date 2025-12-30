
import { subscriptionPlans } from "./seed/subscriptionPlans.seed";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";


const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function seedSubscriptionPlans() {
  for (const plan of subscriptionPlans) {
    const existingPlan = await prisma.subscriptionPlan.findUnique({
      where: { name: plan.name },
    });

    if (existingPlan) {
      console.log(`⏭️ Skipping existing plan: ${plan.name}`);
      continue;
    }

    const createdPlan = await prisma.subscriptionPlan.create({
      data: {
        name: plan.name,
        price: plan.price,
        duration: plan.duration,
        description: plan.description,
        isRecommended: plan.isRecommended,
        features: {
          create: plan.features.map((feature) => ({
            name: feature,
          })),
        },
      },
    });

    console.log(`✅ Created plan: ${createdPlan.name}`);
  }
}

async function main() {
  console.log("🌱 Seeding subscription plans...");
  await seedSubscriptionPlans();
  console.log("🌱 Seeding completed");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
