// Ambulance-crew sign-in: employee ID + 4-digit PIN (+ vehicle). The PIN is checked in Postgres
// (driver_pin_check: bcrypt hash, lockout after 5 misses); on success this returns a normal
// Supabase session for the driver's user, so the app's existing auth and RLS apply unchanged.
// Deploy: supabase functions deploy driver-login
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let body: { employeeId?: string; pin?: string; vehicleId?: string };
  try { body = await req.json(); } catch { return json(400, { error: "Invalid request" }); }
  const employeeId = String(body.employeeId ?? "").trim().toUpperCase();
  const pin = String(body.pin ?? "");
  const vehicleId = body.vehicleId ? String(body.vehicleId) : null;
  if (!/^[A-Z]{2,6}-[0-9]{2,8}$/.test(employeeId) || !/^[0-9]{4}$/.test(pin)) {
    return json(400, { error: "Enter your employee ID and 4-digit PIN" });
  }

  const { data: userId, error: checkErr } = await admin.rpc("driver_pin_check", { p_employee_id: employeeId, p_pin: pin });
  if (checkErr) {
    if (checkErr.message?.includes("driver_locked")) {
      return json(429, { error: "Too many wrong PINs. Try again in 15 minutes or ask control to reset it." });
    }
    console.error("driver_pin_check failed", checkErr);
    return json(500, { error: "Sign-in is unavailable. Try again." });
  }
  if (!userId) return json(401, { error: "Employee ID or PIN is incorrect" });

  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(userId as string);
  if (userErr || !userData.user?.email) return json(500, { error: "Driver account is incomplete. Ask control." });
  const user = userData.user;

  // Claim the vehicle when it exists and isn't already assigned to another driver.
  if (vehicleId) {
    const { data: amb } = await admin.from("ambulances").select("id, assigned_driver_id").eq("id", vehicleId).maybeSingle();
    if (amb) {
      if (amb.assigned_driver_id && amb.assigned_driver_id !== user.id) {
        return json(409, { error: "That vehicle is signed in by another crew" });
      }
      await admin.from("profiles").upsert(
        { id: user.id, email: user.email, full_name: user.user_metadata?.full_name ?? employeeId, role: "DRIVER" },
        { onConflict: "id" },
      );
      await admin.from("ambulances").update({ assigned_driver_id: user.id }).eq("id", vehicleId);
    }
  }

  // Mint a session for the driver: a single-use magic-link token verified server-side.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.email });
  if (linkErr || !link.properties?.hashed_token) {
    console.error("generateLink failed", linkErr);
    return json(500, { error: "Sign-in is unavailable. Try again." });
  }
  const anon = createClient(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified, error: otpErr } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (otpErr || !verified.session) {
    console.error("verifyOtp failed", otpErr);
    return json(500, { error: "Sign-in is unavailable. Try again." });
  }

  return json(200, {
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
    employeeId,
    vehicleId,
  });
});
