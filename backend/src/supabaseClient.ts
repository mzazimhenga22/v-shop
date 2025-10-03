import "dotenv/config"; // THIS MUST BE FIRST
import { createClient } from "@supabase/supabase-js";
import path from "path";

// Explicitly load .env from the backend directory
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: path.resolve(process.cwd(), ".env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is not defined in .env file");
}
if (!supabaseKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not defined in .env file");
}

export const supabase = createClient(supabaseUrl, supabaseKey);