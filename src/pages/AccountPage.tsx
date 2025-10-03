import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { User, Mail, CreditCard, Smartphone, Bitcoin, Check, Copy, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

// Sleek Account Page with frosted-glass cards, subtle motion, and responsive layout.
// Uses Tailwind utility classes (assumes Tailwind is configured).

type UserData = { name?: string; email?: string };

const Field = ({ label, icon: Icon, children }: any) => (
  <label className="block">
    <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
      <Icon className="w-4 h-4 opacity-85" />
      {label}
    </div>
    {children}
  </label>
);

const FrostedCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div
    className={
      "relative rounded-2xl p-6 shadow-2xl border border-white/10 bg-gradient-to-tr from-white/25 to-white/10 dark:from-white/5 dark:to-white/3 backdrop-blur-md" +
      " " +
      className
    }
    style={{
      WebkitBackdropFilter: "blur(12px)",
      backdropFilter: "blur(12px)",
      backgroundColor: "rgba(255,255,255,0.06)",
    }}
  >
    {/* subtle glass glow */}
    <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)" }} />
    {children}
  </div>
);

const AccountPage: React.FC = () => {
  const [userData, setUserData] = useState<UserData>({});
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  const [cardInfo, setCardInfo] = useState({ holder: "", last4: "", brand: "", expiry: "" });
  const [mpesaNumber, setMpesaNumber] = useState("");
  const [cryptoAddress, setCryptoAddress] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      setLoading(true);
      try {
        const { data } = await supabase.auth.getUser();
        const user = (data as any)?.user;
        if (user) {
          setUserData({
            name: user.user_metadata?.name || "",
            email: user.email || "",
          });
          setName(user.user_metadata?.name || "");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  const handleUpdate = async () => {
    setMessage("");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ data: { name } });
    setSaving(false);
    if (error) {
      setMessage("❌ Failed to update name.");
    } else {
      setUserData((prev) => ({ ...prev, name }));
      setMessage("✅ Name updated successfully.");
      setTimeout(() => setMessage(""), 3500);
    }
  };

  const handlePaymentSubmit = async () => {
    setPaymentMessage("");
    setSaving(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = (data as any)?.session?.access_token;
      if (!token) {
        setPaymentMessage("❌ Not authenticated.");
        setSaving(false);
        return;
      }

      const res = await fetch("/account/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: "card",
          card_holder: cardInfo.holder,
          card_last4: cardInfo.last4,
          card_brand: cardInfo.brand,
          expiry: cardInfo.expiry,
          mpesa_number: mpesaNumber,
          crypto_address: cryptoAddress,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error?.message || "Failed to save payment info");

      setPaymentMessage("✅ Payment info saved successfully.");
      setTimeout(() => setPaymentMessage(""), 3500);
    } catch (err: any) {
      setPaymentMessage("❌ " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin w-8 h-8 text-slate-700 dark:text-slate-200" />
          <div className="text-slate-700 dark:text-slate-300">Loading your account…</div>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen py-12 px-6 bg-gradient-to-b from-slate-100 to-white dark:from-gray-900 dark:to-gray-950">
      <div className="max-w-5xl mx-auto grid gap-8 md:grid-cols-2 items-start">
        <motion.header initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.45 }} className="md:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Account Overview</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Manage profile, billing methods and security.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right text-sm">
                <div className="font-medium text-slate-800 dark:text-slate-100">{userData.name || '—'}</div>
                <div className="text-slate-500 dark:text-slate-400 text-xs">{userData.email || '—'}</div>
              </div>
            </div>
          </div>
        </motion.header>

        {/* Profile Card */}
        <motion.div initial={{ x: -12, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.45 }}>
          <FrostedCard>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Profile Details</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Update your display name and contact information.</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <Field label="Full name" icon={User}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white/60 dark:bg-black/30 border border-white/20 dark:border-white/10 text-slate-900 dark:text-slate-50"
                  placeholder="Jane Doe"
                />
              </Field>

              <Field label="Email" icon={Mail}>
                <input
                  value={userData.email}
                  disabled
                  className="w-full rounded-lg px-3 py-2 bg-white/40 dark:bg-black/25 border border-white/10 text-slate-700 dark:text-slate-300"
                />
              </Field>

              <div className="flex items-center justify-end">
                <button
                  onClick={handleUpdate}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save changes
                </button>
              </div>

              {message && <div className="text-sm text-emerald-500 text-center">{message}</div>}
            </div>
          </FrostedCard>
        </motion.div>

        {/* Payment Card */}
        <motion.div initial={{ x: 12, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.45 }}>
          <FrostedCard>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Payment Methods</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Store card, M-Pesa or crypto details for quick checkout.</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Card holder" icon={CreditCard}>
                  <input
                    value={cardInfo.holder}
                    onChange={(e) => setCardInfo({ ...cardInfo, holder: e.target.value })}
                    placeholder="Full name on card"
                    className="w-full rounded-lg px-3 py-2 bg-white/60 dark:bg-black/30 border border-white/10 text-slate-900 dark:text-slate-50"
                  />
                </Field>

                <div className="space-y-2">
                  <Field label="Brand" icon={CreditCard}>
                    <input
                      value={cardInfo.brand}
                      onChange={(e) => setCardInfo({ ...cardInfo, brand: e.target.value })}
                      placeholder="Visa, Mastercard"
                      className="w-full rounded-lg px-3 py-2 bg-white/60 dark:bg-black/30 border border-white/10 text-slate-900 dark:text-slate-50"
                    />
                  </Field>

                  <div className="flex gap-2">
                    <Field label="Last 4" icon={CreditCard}>
                      <input
                        value={cardInfo.last4}
                        onChange={(e) => setCardInfo({ ...cardInfo, last4: e.target.value })}
                        maxLength={4}
                        placeholder="1234"
                        className="w-full rounded-lg px-3 py-2 bg-white/60 dark:bg-black/30 border border-white/10 text-slate-900 dark:text-slate-50"
                      />
                    </Field>

                    <Field label="Expiry" icon={CreditCard}>
                      <input
                        value={cardInfo.expiry}
                        onChange={(e) => setCardInfo({ ...cardInfo, expiry: e.target.value })}
                        placeholder="MM/YY"
                        className="w-full rounded-lg px-3 py-2 bg-white/60 dark:bg-black/30 border border-white/10 text-slate-900 dark:text-slate-50"
                      />
                    </Field>
                  </div>
                </div>
              </div>

              <Field label="M-Pesa Number" icon={Smartphone}>
                <div className="flex gap-2">
                  <input
                    value={mpesaNumber}
                    onChange={(e) => setMpesaNumber(e.target.value)}
                    placeholder="2547XXXXXXXX"
                    className="w-full rounded-lg px-3 py-2 bg-white/60 dark:bg-black/30 border border-white/10 text-slate-900 dark:text-slate-50"
                  />
                  <button
                    onClick={() => {
                      navigator?.clipboard?.writeText(mpesaNumber || "");
                    }}
                    aria-label="Copy M-Pesa"
                    className="px-3 py-2 rounded-lg bg-white/10 border border-white/8 hover:bg-white/20"
                  >
                    <Copy className="w-4 h-4 text-slate-200" />
                  </button>
                </div>
              </Field>

              <Field label="Crypto Address" icon={Bitcoin}>
                <div className="flex gap-2">
                  <input
                    value={cryptoAddress}
                    onChange={(e) => setCryptoAddress(e.target.value)}
                    placeholder="0x... or wallet address"
                    className="w-full rounded-lg px-3 py-2 bg-white/60 dark:bg-black/30 border border-white/10 text-slate-900 dark:text-slate-50"
                  />
                  <button
                    onClick={() => navigator?.clipboard?.writeText(cryptoAddress || "")}
                    aria-label="Copy address"
                    className="px-3 py-2 rounded-lg bg-white/10 border border-white/8 hover:bg-white/20"
                  >
                    <Copy className="w-4 h-4 text-slate-200" />
                  </button>
                </div>
              </Field>

              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={handlePaymentSubmit}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white shadow-md transition"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                  Save payment
                </button>
              </div>

              {paymentMessage && <div className="text-sm text-sky-500 text-center">{paymentMessage}</div>}
            </div>
          </FrostedCard>
        </motion.div>

        {/* Larger settings / activity area (optional) */}
        <motion.div initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.45 }} className="md:col-span-2">
          <FrostedCard className="mt-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Security & Activity</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Recent sign-ins and account security options (coming soon)</p>
              </div>
              <div className="text-sm text-slate-500">Last sign-in: <span className="font-medium text-slate-700 dark:text-slate-300">—</span></div>
            </div>
          </FrostedCard>
        </motion.div>
      </div>
    </div>
  );
};

export default AccountPage;
