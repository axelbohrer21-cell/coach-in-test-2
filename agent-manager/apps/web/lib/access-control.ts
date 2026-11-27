export function isManagerAllowedEmail(email: string): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const allowed = (process.env.MANAGER_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}
