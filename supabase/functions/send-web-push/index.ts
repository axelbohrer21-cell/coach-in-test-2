import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = "BDWLCIv7_fXVqXO17_-ZVjNDU8aT4uPt12cjGQOuJOKwTenM26Dh1nHMa4whfY6xSL85v3glB_NmDGxJbOfpESM";
const vapidSubject = "mailto:Axel.bohrer21@gmail.com";
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const allowedTables = new Set(["coach_notifications", "player_notifications"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const table = payload?.table;
  const notificationId = payload?.record?.id;
  if (!allowedTables.has(table) || typeof notificationId !== "string" || !uuidPattern.test(notificationId)) {
    return Response.json({ error: "Invalid notification event" }, { status: 400 });
  }

  // Never trust the recipient, message, or destination supplied by the HTTP caller.
  // Resolve all of them from the persisted notification using the server-side client.
  const { data: delivery, error: deliveryError } = await supabase
    .from("push_delivery_log")
    .select("notification_id, notification_table, status")
    .eq("notification_id", notificationId)
    .maybeSingle();

  if (deliveryError) return Response.json({ error: deliveryError.message }, { status: 500 });
  if (!delivery || delivery.notification_table !== table || delivery.status !== "queued") {
    return Response.json({ ok: true, skipped: "notification is not queued for this table" });
  }

  const selectedFields = table === "coach_notifications"
    ? "id, coach_id, title, body, target_path"
    : "id, player_id, title, body, target_path";
  const { data: notification, error: notificationError } = await supabase
    .from(table)
    .select(selectedFields)
    .eq("id", notificationId)
    .maybeSingle();

  if (notificationError) return Response.json({ error: notificationError.message }, { status: 500 });
  if (!notification) {
    await supabase.from("push_delivery_log")
      .update({ status: "failed", last_error: "Notification row not found", updated_at: new Date().toISOString() })
      .eq("notification_id", notificationId)
      .eq("notification_table", table)
      .eq("status", "queued");
    return Response.json({ error: "Notification not found" }, { status: 404 });
  }

  const recipientId = table === "coach_notifications"
    ? (notification as any).coach_id
    : (notification as any).player_id;
  if (typeof recipientId !== "string" || !recipientId) {
    return Response.json({ error: "Persisted notification has no recipient" }, { status: 400 });
  }

  const { data: privateKey, error: keyError } = await supabase.rpc("get_coach_in_vapid_secret");
  if (keyError || !privateKey) return Response.json({ error: "Push signing key is not configured" }, { status: 503 });
  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, privateKey);
  } catch {
    return Response.json({ error: "Invalid VAPID key pair" }, { status: 500 });
  }

  // Atomic claim: only one invocation can deliver this persisted notification.
  const { data: claim, error: claimError } = await supabase
    .from("push_delivery_log")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("notification_id", notificationId)
    .eq("notification_table", table)
    .eq("status", "queued")
    .select("notification_id")
    .maybeSingle();

  if (claimError) return Response.json({ error: claimError.message }, { status: 500 });
  if (!claim) return Response.json({ ok: true, skipped: "already processed" });

  const { data: subscriptions, error: subError } = await supabase
    .from("push_subscriptions")
    .select("id, subscription")
    .eq("user_id", recipientId);

  if (subError) {
    await supabase.from("push_delivery_log").update({
      status: "failed",
      last_error: subError.message,
      updated_at: new Date().toISOString()
    }).eq("notification_id", notificationId).eq("notification_table", table);
    return Response.json({ error: subError.message }, { status: 500 });
  }

  const target = ["bookings", "notifications", "messages", "planning", "club", "reports", "sessions"]
    .includes((notification as any).target_path)
    ? (notification as any).target_path
    : "notifications";
  const message = JSON.stringify({
    title: (notification as any).title || "Coach In",
    body: (notification as any).body || "Tu as une nouvelle notification.",
    url: "/?open=" + target,
    tag: notificationId
  });

  let delivered = 0;
  const failures: string[] = [];
  await Promise.all((subscriptions || []).map(async (row: any) => {
    try {
      await webpush.sendNotification(row.subscription, message, { TTL: 86400 });
      delivered++;
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", row.id);
      } else {
        failures.push(String(error?.message || error));
      }
    }
  }));

  const finalStatus = failures.length
    ? (delivered ? "partial" : "failed")
    : (delivered ? "sent" : "no_subscriptions");

  await supabase.from("push_delivery_log").update({
    status: finalStatus,
    delivered_count: delivered,
    last_error: failures.length ? failures.join("; ").slice(0, 1500) : null,
    updated_at: new Date().toISOString()
  }).eq("notification_id", notificationId).eq("notification_table", table);

  return Response.json({ ok: true, delivered, subscriptions: subscriptions?.length || 0, status: finalStatus });
});
