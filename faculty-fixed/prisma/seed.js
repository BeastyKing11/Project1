const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@faculty.app" },
    update: {},
    create: {
      email: "admin@faculty.app",
      password: hashedPassword,
      name: "System Admin",
      role: "ADMIN",
    },
  });
  console.log("Seeded default admin: admin@faculty.app / admin123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
