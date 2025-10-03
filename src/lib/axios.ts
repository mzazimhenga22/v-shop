// axios.ts (or wherever your `api` instance is)
import axios from "axios";
import { supabase } from "@/lib/supabaseClient";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

// Add interceptor to inject Supabase access token
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;
