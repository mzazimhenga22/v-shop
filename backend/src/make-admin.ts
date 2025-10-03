import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config(); // Load ENV variables from .env

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

/**
 * Promotes a user by setting `user_metadata.isAdmin` to true.
 */
async function makeUserAdmin(userId: string) {
  if (!userId) {
    console.error("❌ No userId provided.");
    return;
  }

  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { isAdmin: true },
  });

  if (error) {
    console.error("❌ Failed to update user:", error.message);
  } else {
    console.log("✅ User updated successfully:", data?.user?.email || userId);
  }
}

// Example usage from CLI argument
const userIdArg = process.argv[2];

makeUserAdmin(userIdArg);
