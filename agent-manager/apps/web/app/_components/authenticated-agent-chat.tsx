import { headers } from "next/headers";
import { auth, isManagerAllowedEmail } from "@/lib/auth";
import { AgentChat } from "./agent-chat";
import { AccountControl, AccessDenied, SignIn } from "./web-chat-auth";

export async function AuthenticatedAgentChat({
  sessionId,
  sessionless,
}: {
  readonly sessionId?: string;
  readonly sessionless?: boolean;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return <SignIn />;
  if (!isManagerAllowedEmail(session.user.email)) return <AccessDenied />;

  return (
    <>
      <AgentChat sessionId={sessionId} sessionless={sessionless} />
      <AccountControl
        email={session.user.email}
        image={session.user.image}
        name={session.user.name}
      />
    </>
  );
}
