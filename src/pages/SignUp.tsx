import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FcGoogle } from "react-icons/fc";
import { FaFacebook, FaApple } from "react-icons/fa";
import { supabase } from "@/lib/supabaseClient";

const SignUp = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: { name: formData.name },
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      alert("Check your email to confirm sign-up.");
      navigate("/signin");
    }
  };

  const handleOAuthLogin = async (provider: "google" | "facebook" | "apple") => {
    const { error } = await supabase.auth.signInWithOAuth({ provider });
    if (error) {
      setError(`OAuth login failed: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-transparent">
      <div className="w-full max-w-md space-y-8 bg-white/80 dark:bg-white/10 backdrop-blur-md p-8 rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center">Create Your Account</h2>

        <form onSubmit={handleSignUp} className="space-y-6">
          <div>
            <label className="block text-sm text-gray-700 dark:text-gray-300">Name</label>
            <input
              type="text"
              name="name"
              required
              placeholder="John Doe"
              value={formData.name}
              onChange={handleInputChange}
              className="w-full mt-1 p-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 dark:text-gray-300">Email</label>
            <input
              type="email"
              name="email"
              required
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleInputChange}
              className="w-full mt-1 p-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 dark:text-gray-300">Password</label>
            <input
              type="password"
              name="password"
              required
              placeholder="••••••••"
              value={formData.password}
              onChange={handleInputChange}
              className="w-full mt-1 p-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md transition"
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        {/* Social Signup */}
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <div className="h-px flex-1 bg-gray-300 dark:bg-gray-600" />
            OR CONTINUE WITH
            <div className="h-px flex-1 bg-gray-300 dark:bg-gray-600" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => handleOAuthLogin("google")}
              className="flex items-center justify-center p-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              <FcGoogle className="w-5 h-5" />
            </button>
            <button
              onClick={() => handleOAuthLogin("facebook")}
              className="flex items-center justify-center p-2 border border-gray-300 dark:border-gray-600 rounded-md text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
            >
              <FaFacebook className="w-5 h-5" />
            </button>
            <button
              onClick={() => handleOAuthLogin("apple")}
              className="flex items-center justify-center p-2 border border-gray-300 dark:border-gray-600 rounded-md text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              <FaApple className="w-5 h-5" />
            </button>
          </div>
        </div>

        <p className="text-sm text-center text-gray-500 dark:text-gray-400">
          Already have an account?{" "}
          <Link to="/signin" className="text-green-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default SignUp;
