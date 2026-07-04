import { createInterface } from "node:readline/promises";
import argon2 from "argon2";
import { db } from "../db.js";
import { env } from "../env.js";

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function main() {
  const argEmail = process.argv.find((a) => a.startsWith("--email="))?.split("=")[1];
  const argPassword = process.argv.find((a) => a.startsWith("--password="))?.split("=")[1];

  const email = argEmail ?? env.ADMIN_EMAIL;
  const password = argPassword ?? (await prompt(`Password for ${email}: `));

  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password);

  const existing = await db
    .selectFrom("admin")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();

  if (existing) {
    await db.updateTable("admin").set({ password_hash: passwordHash }).where("id", "=", existing.id).execute();
    console.log(`Updated password for existing admin: ${email}`);
  } else {
    await db.insertInto("admin").values({ email, password_hash: passwordHash }).execute();
    console.log(`Created admin: ${email}`);
  }

  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
