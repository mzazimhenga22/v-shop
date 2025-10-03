import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Link } from "react-router-dom";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`, // After clicking link
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setMessage("Check your email for the password reset link.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-transparent">
      <div className="w-full max-w-md space-y-6 bg-white/80 dark:bg-white/10 backdrop-blur-md p-8 rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center">
          Forgot Password
        </h2>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        {message && <p className="text-green-600 text-sm">{message}</p>}

        <form className="space-y-4" onSubmit={handleResetPassword}>
          <div>
            <label className="block text-sm text-gray-700 dark:text-gray-300">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full mt-1 p-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md transition"
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        <p className="text-sm text-center text-gray-500 dark:text-gray-400">
          Remembered your password?{" "}
          <Link to="/signin" className="text-green-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default ForgotPassword;
