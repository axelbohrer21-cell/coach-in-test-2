import { eveChannel } from "eve/channels/eve";
import { localDev, type AuthFn, vercelOidc } from "eve/channels/auth";
import { auth, isManagerAllowedEmail } from "../../apps/web/lib/auth.js";

const betterAuthSession: AuthFn<Request> = async (request) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !isManagerAllowedEmail(session.user.email)) return null;

  const attributes: Record<string, string> = {
    email: session.user.email,
    name: session.user.name,
  };
  if (session.user.image) {
    attributes.picture = session.user.image;
  }

  return {
    attributes,
    authenticator: "better-auth:vercel",
    principalId: session.user.id,
    principalType: "user",
  };
};

// Vercel injects VERCEL_PROJECT_ID in hosted deployments. Local/CI discovery has no trusted deployment identity.
const vercelAuth = process.env.VERCEL_PROJECT_ID ? [vercelOidc()] : [];

export default eveChannel({
  auth: [betterAuthSession, ...vercelAuth, localDev()],
});
