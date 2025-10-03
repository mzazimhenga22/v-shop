import express, { Request, Response } from "express";
import { supabase } from "../supabaseClient.js";
import { authMiddleware } from "../authMiddleware.js";
import Stripe from "stripe";

interface AuthRequest extends Request {
  user?: any;
}

const router = express.Router();

/* Stripe guard — do NOT supply apiVersion to avoid mismatches with installed @stripe/ types */
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const stripe: Stripe | null = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

/* ---------------- user_payment_info ---------------- */
router.post("/payment", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { type, card_holder, card_last4, card_brand, expiry, mpesa_number, crypto_address } = req.body;
    const user = req.user;
    const { data, error } = await supabase
      .from("user_payment_info")
      .upsert(
        [
          {
            user_id: user.id,
            type,
            card_holder,
            card_last4,
            card_brand,
            expiry,
            mpesa_number,
            crypto_address,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: "user_id" }
      );
    if (error) return res.status(400).json({ error });
    res.json({ message: "Payment info saved", data });
  } catch (err: any) {
    console.error("user payment upsert error:", err);
    res.status(500).json({ error: err?.message || String(err) });
  }
});

router.get("/payment", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    const { data, error } = await supabase.from("user_payment_info").select("*").eq("user_id", user.id);
    if (error) return res.status(400).json({ error });
    res.json({ data });
  } catch (err: any) {
    console.error("get user payment info error:", err);
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/* ---------------- MPesa (Daraja STK Push) ---------------- */
const DARAJA_ENV = (process.env.DARAJA_ENV || "sandbox").toLowerCase();
const DARAJA_BASE = DARAJA_ENV === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
const DAR_CONSUMER_KEY = process.env.DARAJA_CONSUMER_KEY || "";
const DAR_CONSUMER_SECRET = process.env.DARAJA_CONSUMER_SECRET || "";
const DAR_SHORTCODE = process.env.DARAJA_SHORTCODE || "";
const DAR_PASSKEY = process.env.DARAJA_PASSKEY || "";
const DAR_CALLBACK = process.env.DARAJA_CALLBACK_URL || "";

const mpesaStore: Record<string, any> = {};
const now = () => new Date().toISOString();
const pad = (n: number) => String(n).padStart(2, "0");
const timestamp = () => {
  const d = new Date();
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
};

async function getDarajaToken() {
  if (!DAR_CONSUMER_KEY || !DAR_CONSUMER_SECRET) {
    throw new Error("Missing Daraja keys (DARAJA_CONSUMER_KEY / DARAJA_CONSUMER_SECRET)");
  }
  const auth = Buffer.from(`${DAR_CONSUMER_KEY}:${DAR_CONSUMER_SECRET}`).toString("base64");
  const url = `${DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials`;
  console.log(`[Daraja] requesting token from ${url} (env=${DARAJA_ENV})`);
  const r = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  const txt = await r.text();
  try {
    const j = JSON.parse(txt);
    if (!j.access_token) throw new Error(`No access_token in response: ${txt}`);
    return j.access_token;
  } catch (err) {
    throw new Error(`Daraja token error: ${txt}`);
  }
}

router.post("/mpesa", async (req, res) => {
  try {
    const { phone, amount, accountRef, description } = req.body;
    console.log("[MPESA] /mpesa called with", { phone, amount, accountRef, description });

    if (!phone || amount == null) return res.status(400).json({ ok: false, error: "phone & amount required" });
    if (!DAR_SHORTCODE || !DAR_PASSKEY || !DAR_CALLBACK) {
      console.error("[MPESA] Daraja env missing", {
        DAR_SHORTCODE: !!DAR_SHORTCODE,
        DAR_PASSKEY: !!DAR_PASSKEY,
        DAR_CALLBACK: !!DAR_CALLBACK,
      });
      return res.status(500).json({ ok: false, error: "Daraja env vars missing" });
    }

    // normalize phone into MSISDN for Kenya (254...)
    let msisdn = String(phone).replace(/[^0-9+]/g, "");
    if (msisdn.startsWith("+")) msisdn = msisdn.slice(1);
    if (msisdn.startsWith("0") && msisdn.length === 10) msisdn = `254${msisdn.slice(1)}`;
    if (!msisdn.startsWith("254") && msisdn.length === 9) msisdn = `254${msisdn}`;

    const token = await getDarajaToken();
    const ts = timestamp();
    const password = Buffer.from(`${DAR_SHORTCODE}${DAR_PASSKEY}${ts}`).toString("base64");

    const payload = {
      BusinessShortCode: DAR_SHORTCODE,
      Password: password,
      Timestamp: ts,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(Number(amount)),
      PartyA: msisdn,
      PartyB: DAR_SHORTCODE,
      PhoneNumber: msisdn,
      CallBackURL: DAR_CALLBACK,
      AccountReference: accountRef || `ORD-${Date.now()}`,
      TransactionDesc: description || "Payment",
    };

    console.log("[MPESA] STK push payload", payload);

    const r = await fetch(`${DARAJA_BASE}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const rawText = await r.text();
    let j: any;
    try {
      j = JSON.parse(rawText);
    } catch (parseErr) {
      console.warn("[MPESA] Non-JSON response from Daraja:", rawText);
      return res.status(502).json({ ok: false, error: "Daraja returned non-JSON response", darajaRaw: rawText });
    }

    console.log("[MPESA] Daraja response:", j);

    const checkoutId = j.CheckoutRequestID ?? j.MerchantRequestID ?? null;
    if (!checkoutId) {
      const darajaErrorMsg = j.errorMessage ?? j.error ?? j.error_description ?? j.Message ?? j.ResponseDescription ?? j.responseMessage ?? null;
      console.warn("[MPESA] No checkoutId in Daraja response", { darajaErrorMsg, j });
      return res.status(400).json({ ok: false, error: "M-Pesa initiation failed (no checkoutId)", daraja: j, darajaMessage: darajaErrorMsg ?? null });
    }

    mpesaStore[checkoutId] = { status: "initiated", createdAt: now(), request: payload, daraja: j };
    console.log("[MPESA] stored checkoutId:", checkoutId);
    return res.json({ ok: true, checkoutId, daraja: j });
  } catch (err: any) {
    console.error("[MPESA] initiation error:", err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

router.post("/mpesa/callback", (req, res) => {
  try {
    const cb = req.body?.Body?.stkCallback ?? req.body ?? null;
    console.log("[MPESA] callback received:", cb ? cb : req.body);

    const stk = cb?.stkCallback ?? cb;
    const checkoutId = stk?.CheckoutRequestID ?? stk?.MerchantRequestID ?? null;
    if (!checkoutId) {
      console.warn("[MPESA] callback received without CheckoutRequestID, storing raw callback for inspection");
      const syntheticId = `cb_${Date.now()}`;
      mpesaStore[syntheticId] = { status: "callback_no_id", updatedAt: now(), raw: cb };
      return res.status(200).json({ ok: true });
    }

    mpesaStore[checkoutId] = {
      ...(mpesaStore[checkoutId] || {}),
      status: stk.ResultCode === 0 ? "success" : "failed",
      resultCode: stk.ResultCode,
      resultDesc: stk.ResultDesc ?? stk.ResultDescription ?? stk.resultDesc ?? null,
      updatedAt: now(),
      raw: stk,
    };

    console.log(`[MPESA] callback stored for ${checkoutId}:`, mpesaStore[checkoutId]);
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[MPESA] callback handler error:", err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

router.get("/mpesa/status", (req, res) => {
  try {
    const id = String(req.query.checkoutId || "");
    if (!id || id === "null" || id === "undefined") {
      return res.status(400).json({ ok: false, error: "checkoutId required" });
    }
    const info = mpesaStore[id];
    if (!info) return res.status(404).json({ ok: false, error: "not found" });
    return res.json({ ok: true, status: info.status || "pending", info });
  } catch (err: any) {
    console.error("[MPESA] status error:", err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

/* ---------------- Stripe payment-intent handler ----------------
   Behavior:
   - If the client sends an `order` object in the body, create a provisional order row
     with payment_status = 'pending' and attach the created order.id to PaymentIntent metadata.
   - Return clientSecret + created order (if any) to the client.
   - Defensive against PostgREST schema-cache errors (PGRST204) and common FK issues.
*/
export const createPaymentIntentHandler = async (req: Request, res: Response) => {
  try {
    if (!stripe) return res.status(500).json({ ok: false, error: "Stripe not configured" });

    const { amount, amount_cents, currency = "usd", metadata = {}, order: clientOrder, meta: topMeta } = req.body || {};
    if (amount_cents == null && amount == null) return res.status(400).json({ ok: false, error: "amount or amount_cents required" });

    // canonical idempotency key: header > body.meta.idempotency_key / idempotencyKey > client_ts fallback
    const idempotencyHeaderRaw = (req.headers["idempotency-key"] || req.headers["idempotency_key"] || req.headers["Idempotency-Key"] || null) as string | null;
    const idempotencyHeader = idempotencyHeaderRaw ? String(idempotencyHeaderRaw).trim() : null;
    const bodyMeta = clientOrder?.meta ?? topMeta ?? {};
    const ikFromMetaRaw = bodyMeta?.idempotency_key ?? bodyMeta?.idempotencyKey ?? null;
    const ikFromMeta = ikFromMetaRaw ? String(ikFromMetaRaw).trim() : null;
    const clientTs = bodyMeta?.client_ts ?? null;
    const ikToUse = idempotencyHeader ?? ikFromMeta ?? (clientTs ? `pi:${String(clientTs)}` : null);

    const cents = amount_cents != null ? Number(amount_cents) : Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return res.status(400).json({ ok: false, error: "invalid amount" });

    // Defensive provisional order insertion helper
    const tryInsertOrderDefensive = async (payload: Record<string, any>): Promise<any | null> => {
      const maxRetries = 6;
      const triedColumnsRemoved = new Set<string>();
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const { data, error } = await supabase.from("orders").insert([payload]).select().maybeSingle();
          if (error) {
            const msg = String(error.message || error).toLowerCase();
            if (error?.code === "PGRST204" || msg.includes("could not find the") || msg.includes("could not find column")) {
              const match = String(error.message || "").match(/Could not find the '([^']+)' column/i);
              const missingCol = match ? match[1] : null;
              if (missingCol && payload.hasOwnProperty(missingCol) && !triedColumnsRemoved.has(missingCol)) {
                delete payload[missingCol];
                triedColumnsRemoved.add(missingCol);
                continue;
              }
              const optionalCandidates = ["payment_details", "shipping_coordinates", "vendor_id", "delivered_at"];
              let removedOne = false;
              for (const c of optionalCandidates) {
                if (payload.hasOwnProperty(c) && !triedColumnsRemoved.has(c)) {
                  delete payload[c];
                  triedColumnsRemoved.add(c);
                  removedOne = true;
                  break;
                }
              }
              if (removedOne) continue;
            }

            if (error?.code === "23503" || msg.includes("foreign key")) {
              if (payload.hasOwnProperty("vendor_id") && !triedColumnsRemoved.has("vendor_id")) {
                delete payload.vendor_id;
                triedColumnsRemoved.add("vendor_id");
                continue;
              }
            }

            console.warn("[createPaymentIntent] provisional order insert error (will not block PI creation):", error);
            return null;
          }

          return data ?? null;
        } catch (ex) {
          console.warn("[createPaymentIntent] provisional order insert exception (attempting to continue):", ex);
          const fallbackKeys = ["payment_details", "shipping_coordinates", "vendor_id"];
          let removed = false;
          for (const k of fallbackKeys) {
            if (payload.hasOwnProperty(k) && !triedColumnsRemoved.has(k)) {
              delete payload[k];
              triedColumnsRemoved.add(k);
              removed = true;
              break;
            }
          }
          if (!removed) break;
        }
      }
      return null;
    };

    // If client supplied an order object, attempt to create a provisional order (but be idempotent)
    let createdOrder: any = null;
    if (clientOrder && typeof clientOrder === "object") {
      try {
        const toInsert: Record<string, any> = {
          user_id: clientOrder.user_id ?? null,
          vendor_id: clientOrder.vendor_id ?? null,
          name: clientOrder.name ?? null,
          email: clientOrder.email ?? null,
          shipping_address: clientOrder.shipping_address ?? null,
          shipping_coordinates: clientOrder.shipping_coordinates ?? null,
          total_amount: clientOrder.total_amount ?? Math.round(cents / 100),
          items: typeof clientOrder.items === "string" ? clientOrder.items : JSON.stringify(clientOrder.items ?? []),
          payment_method: clientOrder.payment_method ?? null,
          payment_status: "pending",
          payment_details: clientOrder.payment_details ?? {},
          meta: { ...(clientOrder.meta ?? {}), server_ts: new Date().toISOString() },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (ikToUse) {
          toInsert.idempotency_key = ikToUse;
          toInsert.meta.idempotency_key = ikToUse;
        } else if (clientTs && !toInsert.meta.idempotency_key) {
          toInsert.meta.client_ts = clientTs;
        }

        // pre-check by top-level idempotency_key (scoped to user_id)
        if (toInsert.idempotency_key && toInsert.user_id) {
          try {
            const { data: existing, error } = await supabase
              .from("orders")
              .select("*")
              .eq("user_id", toInsert.user_id)
              .eq("idempotency_key", toInsert.idempotency_key)
              .maybeSingle();
            if (!error && existing) {
              createdOrder = existing;
            }
          } catch (preErr) {
            // ignore and proceed to insert (we'll handle unique-violation)
          }
        }

        // fallback check: meta->>idempotency_key
        if (!createdOrder && toInsert.idempotency_key && toInsert.user_id) {
          try {
            const { data: existing2, error: err2 } = await supabase
              .from("orders")
              .select("*")
              .eq("user_id", toInsert.user_id)
              .filter("meta->>idempotency_key", "eq", toInsert.idempotency_key)
              .maybeSingle();
            if (!err2 && existing2) createdOrder = existing2;
          } catch (_) {
            // ignore
          }
        }

        // If not found, try inserting defensively (and handle unique-violation)
        if (!createdOrder) {
          try {
            const ins = await tryInsertOrderDefensive(toInsert);
            if (ins) {
              createdOrder = ins;
            }
          } catch (insErr: any) {
            const isUniqueViolation =
              String(insErr?.message || "").toLowerCase().includes("idempotency_key") || insErr?.code === "23505";
            if (isUniqueViolation && toInsert.idempotency_key && toInsert.user_id) {
              try {
                const { data: maybeExisting, error } = await supabase
                  .from("orders")
                  .select("*")
                  .eq("user_id", toInsert.user_id)
                  .eq("idempotency_key", toInsert.idempotency_key)
                  .maybeSingle();
                if (!error && maybeExisting) createdOrder = maybeExisting;
                else {
                  const { data: fb, error: fbErr } = await supabase
                    .from("orders")
                    .select("*")
                    .filter("meta->>idempotency_key", "eq", toInsert.idempotency_key)
                    .maybeSingle();
                  if (!fbErr && fb) createdOrder = fb;
                }
              } catch (reErr) {
                // ignore and continue
              }
            }
          }
        }
      } catch (err) {
        console.warn("[createPaymentIntent] provisional order flow exception:", err);
      }
    }

    // Build metadata for PaymentIntent: ensure order_id and idempotency key (if present) are included
    const metadataForPI: Record<string, string> = { ...(metadata || {}) };
    if (createdOrder && createdOrder.id) metadataForPI.order_id = String(createdOrder.id);
    if (ikToUse) metadataForPI.idempotency_key = ikToUse;
    if (clientTs && !metadataForPI.client_ts) metadataForPI.client_ts = String(clientTs);

    const pi = await stripe.paymentIntents.create({
      amount: Math.round(cents),
      currency,
      metadata: metadataForPI,
      automatic_payment_methods: { enabled: true },
    });

    // best-effort: attach the created PI id back to the provisional order payment_details (if the column exists)
    if (createdOrder && createdOrder.id) {
      try {
        const updateObj: any = {};
        updateObj.payment_details = { ...(createdOrder.payment_details || {}), stripePaymentIntentId: pi.id };
        updateObj.updated_at = new Date().toISOString();
        const { error: updErr } = await supabase.from("orders").update(updateObj).eq("id", createdOrder.id);
        if (updErr) {
          const msg = String(updErr?.message || "").toLowerCase();
          if (updErr?.code === "PGRST204" || msg.includes("could not find the") || msg.includes("could not find column")) {
            const { error: retryErr } = await supabase.from("orders").update({ updated_at: new Date().toISOString() }).eq("id", createdOrder.id);
            if (retryErr) console.warn("Failed to update provisional order after stripping payment_details:", retryErr);
          } else {
            console.warn("Failed to attach stripePaymentIntentId to provisional order (non-fatal):", updErr);
          }
        }
      } catch (err) {
        console.warn("Failed to attach stripePaymentIntentId (exception):", err);
      }
    }

    res.json({ ok: true, clientSecret: pi.client_secret, id: pi.id, order: createdOrder || null });
  } catch (err: any) {
    console.error("createPaymentIntent error:", err);
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
};

// bind the route so mounted router has the endpoint
router.post("/stripe/create-payment-intent", express.json(), createPaymentIntentHandler);

/*
  Stripe webhook handler.

  IMPORTANT: When you mount this route in your main Express server, use:
    app.post("/webhook/stripe", express.raw({ type: "application/json" }), stripeWebhookHandler);

  Stripe requires the raw body for signature verification. If you don't use the raw body middleware,
  the handler will attempt a fallback (non-verified) parse, but verified webhook handling requires raw.
*/
export const stripeWebhookHandler = async (req: any, res: any) => {
  if (!stripe) return res.status(500).send("Stripe not configured");

  const sig = (req.headers && (req.headers["stripe-signature"] || req.headers["Stripe-Signature"])) as string | undefined;

  try {
    let event: any;
    if (STRIPE_WEBHOOK_SECRET && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } else {
      event = req.body && typeof req.body === "object" ? req.body : JSON.parse(req.body?.toString?.() || "{}");
    }

    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.order_id ?? null;
        const ikFromPI = pi.metadata?.idempotency_key ?? null;
        const clientTsFromPI = pi.metadata?.client_ts ?? null;

        // Small helper to update an order row to paid
        const markOrderPaid = async (orderIdToMark: any, extra: any = {}) => {
          try {
            const updatePayload: any = {
              payment_status: "paid",
              status: "confirmed",
              payment_details: { stripePaymentIntentId: pi.id, stripeRaw: pi },
              updated_at: new Date().toISOString(),
              ...extra,
            };
            const { data, error } = await supabase.from("orders").update(updatePayload).eq("id", orderIdToMark).select().maybeSingle();
            if (error) {
              console.warn("Failed to mark order paid (by id) in webhook:", error);
              return null;
            }
            console.log("Order marked paid via webhook (id):", orderIdToMark);
            return data;
          } catch (err) {
            console.error("Webhook DB update error (by id):", err);
            return null;
          }
        };

        // 1) If orderId present, try direct update
        if (orderId) {
          const updated = await markOrderPaid(orderId);
          if (updated) return res.json({ received: true });
          // if failed, continue to other fallbacks
        }

        // 2) Try lookup by idempotency_key (meta or top-level)
        if (ikFromPI) {
          try {
            // try meta->>idempotency_key first
            const { data: byMeta, error: metErr } = await supabase
              .from("orders")
              .select("*")
              .filter("meta->>idempotency_key", "eq", ikFromPI)
              .maybeSingle();
            if (!metErr && byMeta) {
              const oid = (byMeta as any).id;
              await markOrderPaid(oid);
              return res.json({ received: true, matched_by: "idempotency_key_meta" });
            }

            // then try top-level idempotency_key column if present
            const { data: byTop, error: topErr } = await supabase
              .from("orders")
              .select("*")
              .eq("idempotency_key", ikFromPI)
              .maybeSingle();
            if (!topErr && byTop) {
              const oid = (byTop as any).id;
              await markOrderPaid(oid);
              return res.json({ received: true, matched_by: "idempotency_key_top" });
            }
          } catch (err) {
            console.warn("Webhook idempotency_key lookup failed (will continue to other fallbacks):", err);
          }
        }

        // 3) Existing fallback: try payment_details->>stripePaymentIntentId
        try {
          const { data: maybeOrders, error: qErr } = await supabase
            .from("orders")
            .select("*")
            .filter("payment_details->>stripePaymentIntentId", "eq", pi.id)
            .limit(1)
            .maybeSingle();

          if (!qErr && maybeOrders) {
            const oid = (maybeOrders as any).id;
            await markOrderPaid(oid);
            return res.json({ received: true, matched_by: "payment_details" });
          }
        } catch (err) {
          console.warn("Webhook fallback order lookup (payment_details) error (will try heuristic):", err);
        }

        // 4) Try matching by metadata.client_ts (if present)
        if (clientTsFromPI) {
          try {
            const { data: byClientTs, error: csErr } = await supabase
              .from("orders")
              .select("*")
              .filter("meta->>client_ts", "eq", String(clientTsFromPI))
              .maybeSingle();
            if (!csErr && byClientTs) {
              const oid = (byClientTs as any).id;
              await markOrderPaid(oid);
              return res.json({ received: true, matched_by: "meta_client_ts" });
            }
          } catch (err) {
            console.warn("Webhook lookup by client_ts failed:", err);
          }
        }

        // 5) Heuristic fallback: try match by PI's charge email + amount + recent time window
        // 5) Heuristic fallback: try match by PI's charge email + amount + recent time window
        try {
          // Stripe typings sometimes don't include `charges` on PaymentIntent depending on the library version.
          // Use a narrow `any` cast to safely access charges/receipt_email at runtime.
          const charge = (pi as any)?.charges?.data?.[0] ?? null;
          const billingEmail = charge?.billing_details?.email ?? (pi as any)?.receipt_email ?? null;
          const piAmountBase = (pi.amount ?? 0) / 100;
          const oneHourAgo = new Date(Date.now() - 1000 * 60 * 60).toISOString();

          if (billingEmail) {
            // look for recent pending orders with matching email & amount
            const { data: candidates, error: candErr } = await supabase
              .from("orders")
              .select("*")
              .gte("created_at", oneHourAgo)
              .eq("payment_status", "pending")
              .eq("email", billingEmail)
              .eq("total_amount", piAmountBase)
              .order("created_at", { ascending: false })
              .limit(5);

            if (!candErr && Array.isArray(candidates) && candidates.length === 1) {
              const chosen = candidates[0] as any;
              await markOrderPaid(chosen.id, { matched_by: "email_amount" });
              return res.json({ received: true, heuristicMatched: true, matched_by: "email_amount", orderId: chosen.id });
            }

            if (!candErr && Array.isArray(candidates) && candidates.length > 1) {
              console.warn("Webhook heuristic (email+amount) found multiple candidate orders; not auto-matching to avoid mistakes.");
            }
          } else {
            // If no email, try matching by amount only if there's a single recent pending order with same amount
            const { data: candidates2, error: candErr2 } = await supabase
              .from("orders")
              .select("*")
              .gte("created_at", oneHourAgo)
              .eq("payment_status", "pending")
              .eq("total_amount", piAmountBase)
              .order("created_at", { ascending: false })
              .limit(5);

            if (!candErr2 && Array.isArray(candidates2) && candidates2.length === 1) {
              const chosen = candidates2[0] as any;
              await markOrderPaid(chosen.id, { matched_by: "amount_only" });
              return res.json({ received: true, heuristicMatched: true, matched_by: "amount_only", orderId: chosen.id });
            } else if (!candErr2 && Array.isArray(candidates2) && candidates2.length > 1) {
              console.warn("Webhook heuristic (amount only) found multiple candidates; skipping auto-match.");
            }
          }
        } catch (err) {
          console.error("Webhook heuristic fallback failed:", err);
        }


        // Nothing matched
        return res.json({ received: true, message: "processed but no matching order found" });
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.order_id ?? null;
        if (orderId) {
          try {
            const { error } = await supabase.from("orders").update({
              payment_status: "failed",
              payment_details: { stripePaymentIntentId: pi.id, stripeRaw: pi },
              updated_at: new Date().toISOString(),
            }).eq("id", orderId);
            if (error) console.warn("Failed to mark order failed in webhook:", error);
            else console.log("Order marked failed via webhook:", orderId);
          } catch (err) {
            console.error("Webhook DB update error (failed):", err);
          }
        } else {
          console.warn("Webhook payment_failed: no metadata.order_id provided for PI:", pi.id);
        }
        return res.json({ received: true });
      }

      default:
        console.log("Unhandled stripe event:", event.type);
        return res.json({ received: true });
    }
  } catch (err: any) {
    console.error("Stripe webhook error:", err?.message || err);
    return res.status(400).send(`Webhook Error: ${err?.message || String(err)}`);
  }
};

export default router;
