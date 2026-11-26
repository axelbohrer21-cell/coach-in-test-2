import { defineSandbox } from "eve/sandbox";
import {
  VERCEL_EVE_GIT_SANDBOX_IMAGE,
  VercelSandbox,
} from "eve/sandbox/vercel";

// The Manager and its coding specialists share one isolated Vercel Sandbox.
// Network access is limited to public source/package hosts; no production
// database, app secrets, or deployment credentials are mounted here.
export const environment = VercelSandbox.environment({
  image: VERCEL_EVE_GIT_SANDBOX_IMAGE,
});

export default defineSandbox(() =>
  environment.open({
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
  }),
);
