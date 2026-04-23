// One-off: upsert a super_admin with a bcrypt password.
// Usage: npx tsx src/db/create-admin.ts <email> <password>

import bcrypt from "bcryptjs";
import { prisma } from "./client";

async function main() {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    throw new Error("usage: npx tsx src/db/create-admin.ts <email> <password>");
  }
  const normalised = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.adminUser.upsert({
    where: { email: normalised },
    update: { passwordHash, role: "super_admin" },
    create: {
      email: normalised,
      passwordHash,
      role: "super_admin",
      name: normalised.split("@")[0],
    },
  });
  console.log(`upserted ${admin.email} (${admin.role})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
