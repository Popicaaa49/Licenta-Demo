import fs from "fs/promises";
import path from "path";
import { db } from "../db/pool";

const migrationsDirectory = path.resolve(__dirname, "../../sql/migrations");

const run = async () => {
  const client = await db.withClient(async (connection) => {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = (await fs.readdir(migrationsDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const filename of files) {
      const applied = await connection.query<{ filename: string }>(
        "SELECT filename FROM schema_migrations WHERE filename = $1",
        [filename]
      );
      if (applied.rowCount) {
        continue;
      }

      const migration = await fs.readFile(path.join(migrationsDirectory, filename), "utf8");
      await connection.query("BEGIN");
      try {
        await connection.query(migration);
        await connection.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
        await connection.query("COMMIT");
        console.log(`Applied migration ${filename}`);
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      }
    }
  });

  return client;
};

run()
  .catch((error) => {
    console.error("Database migration failed", error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
