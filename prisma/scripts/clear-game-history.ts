import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function clearGameHistory() {
  try {
    console.log("🗑️  Clearing game history table...");
    const deleted = await prisma.gameHistory.deleteMany({});
    console.log(`✅ Deleted ${deleted.count} game history records`);
  } catch (error) {
    console.error("❌ Error clearing game history:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

clearGameHistory();
