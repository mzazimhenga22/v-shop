import "dotenv/config";
import { Client } from "pg";

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required by Supabase
  },
});

const createOrdersTable = async () => {
  try {
    await client.connect();
    console.log("📡 Connected to Supabase PostgreSQL");

    const sql = `
      create table if not exists public.orders (
        id uuid primary key default uuid_generate_v4(),
        user_id uuid references auth.users(id) on delete set null,
        status text not null default 'pending',
        total_amount numeric not null,
        items jsonb,
        created_at timestamp with time zone default now()
      );
    `;

    await client.query(sql);
    console.log("✅ Orders table created successfully");
  } catch (err) {
    console.error("❌ Failed to create orders table:", err);
  } finally {
    await client.end();
  }
};

createOrdersTable();
