import { defineSandbox } from "eve/sandbox";
import { VercelSandbox } from "eve/sandbox/vercel";

// Use Eve's supported default Vercel Sandbox image. The optional eve-git image
// is not provisioned for this project, so Git tooling is kept to the default
// runtime instead of depending on an unavailable custom image.
// Network access is limited to public source/package hosts; no production
// database, app secrets, or deployment credentials are mounted here.
export const environment = VercelSandbox.environment();

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
