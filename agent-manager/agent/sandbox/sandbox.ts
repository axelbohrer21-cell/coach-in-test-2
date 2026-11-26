import { DefaultSandbox, defineSandbox } from "eve/sandbox";

// Eve selects Vercel Sandbox for deployed sessions, Docker when available locally,
// and just-bash for eve dev. CI can compile without requiring Vercel OIDC.
export const environment = DefaultSandbox.environment();

export default defineSandbox(() => {
  if (process.env.VERCEL) {
    return environment.open({
      networkPolicy: {
        allow: {
          "github.com": [],
          "api.github.com": [],
          "objects.githubusercontent.com": [],
          "codeload.github.com": [],
          "registry.npmjs.org": [],
          "registry.yarnpkg.com": [],
        },
      },
    });
  }
  return environment.open();
});
