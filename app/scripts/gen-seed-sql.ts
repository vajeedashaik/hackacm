import { mkdirSync, writeFileSync } from "node:fs";
import { dbToInsertSql } from "../src/server/db/sql";
import { buildSeedDb } from "../src/server/seed";

mkdirSync("supabase", { recursive: true });
writeFileSync("supabase/seed.sql", dbToInsertSql(buildSeedDb()));
console.log("wrote supabase/seed.sql");
