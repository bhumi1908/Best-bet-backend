
import { subscriptionPlans } from "./seed/subscriptionPlans.seed";
import { generatePredictionsFromGameHistory } from "./seed/predictions.seed";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from 'dotenv';
import { parseGameHistoryData } from "./seed/gameHistory.seed";
dotenv.config({ path: '.env' });
console.log('DATABASE_URL', process.env.DATABASE_URL);

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

async function seedPredictions() {
  console.log("🌱 Seeding predictions...");
  
  // Get the first available state
  const firstState = await prisma.state.findFirst({
    where: { isActive: true, isDeleted: false },
  });

  if (!firstState) {
    console.error("❌ No active state found. Please create a state first.");
    return;
  }

  console.log(`📍 Using state: ${firstState.name} (ID: ${firstState.id})`);
  
  const predictionsData = generatePredictionsFromGameHistory();
  
  // Update all predictions to use the actual stateId
  const predictionsWithState = predictionsData.map(p => ({
    ...p,
    stateId: firstState.id,
  }));
  
  let created = 0;
  let skipped = 0;
  
  for (const prediction of predictionsWithState) {
    // Check if prediction already exists
    const existing = await prisma.prediction.findFirst({
      where: {
        date: prediction.date,
        gameId: prediction.gameId,
        stateId: prediction.stateId,
        drawTime: prediction.drawTime,
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.prediction.create({
      data: {
        date: prediction.date,
        gameId: prediction.gameId,
        stateId: prediction.stateId,
        drawTime: prediction.drawTime,
        predictions: prediction.predictions,
      },
    });
    created++;
  }

  console.log(`✅ Created ${created} predictions`);
  if (skipped > 0) {
    console.log(`⏭️ Skipped ${skipped} existing predictions`);
  }
}

async function seedGameHistory() {
  console.log("🌱 Seeding game history...");
  
  // Get required state and game type
  const firstState = await prisma.state.findFirst({
    where: { isActive: true, isDeleted: false },
  });

  if (!firstState) {
    console.error("❌ No active state found. Please create a state first.");
    return;
  }

  const firstGameType = await prisma.gameType.findFirst({
    where: { isActive: true, isDeleted: false },
  });

  if (!firstGameType) {
    console.error("❌ No active game type found. Please create a game type first.");
    return;
  }

  const gameHistoryData = parseGameHistoryData();
  let created = 0;
  let skipped = 0;

  for (const record of gameHistoryData) {
    // Parse date (format: M/D/YYYY)
    const [month, day, year] = record.date.split('/');
    const drawDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    
    // Check if record already exists
    const existing = await prisma.gameHistory.findFirst({
      where: {
        stateId: firstState.id,
        gameTypeId: firstGameType.id,
        drawDate: drawDate,
        drawTime: record.drawTime,
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.gameHistory.create({
      data: {
        stateId: firstState.id,
        gameTypeId: firstGameType.id,
        drawDate: drawDate,
        drawTime: record.drawTime,
        winningNumbers: record.result,
        resultStatus: 'WIN', // or 'PENDING' if you want
      },
    });
    created++;
  }

  console.log(`✅ Created ${created} game history records`);
  if (skipped > 0) {
    console.log(`⏭️ Skipped ${skipped} existing records`);
  }
}

async function main() {
  // console.log("🌱 Seeding subscription plans...");
  // await seedSubscriptionPlans();
  
  // console.log("🌱 Seeding predictions...");
  // await seedPredictions();

  console.log("🌱 Seeding game history...");
  await seedGameHistory();
  
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
