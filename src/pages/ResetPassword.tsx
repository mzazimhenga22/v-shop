import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Link } from "react-router-dom";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
    } else {
      setMessage("Password updated successfully! You can now sign in.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 transition-colors duration-300">
      <div className="w-full max-w-md p-8 bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-2xl transition-colors duration-300">
        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-gray-100">
          Reset Password
        </h2>

        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
        {message && <p className="text-green-600 dark:text-green-400">{message}</p>}

        <form className="space-y-4 mt-4" onSubmit={handleUpdatePassword}>
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors duration-300"
          />
          <button
            type="submit"
            className="w-full py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors duration-300"
          >
            Update Password
          </button>
        </form>

        <p className="mt-4 text-sm text-center text-gray-500 dark:text-gray-400">
          Remembered your password?{" "}
          <Link to="/signin" className="text-green-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default ResetPassword;
