import type { CapacitorConfig } from "@capacitor/cli";

// The native apps are a shell around the deployed site: every web deploy
// updates app users instantly, with no store re-review. webDir is a stub the
// CLI requires; nothing is bundled because server.url wins.
const config: CapacitorConfig = {
  appId: "io.tekscribe.app",
  appName: "TekScribe",
  webDir: "public",
  server: {
    url: "https://tekscribe.io",
    // OAuth (Google Drive connect) redirects through Google before coming
    // back to the site; allow it to stay inside the app's web view.
    allowNavigation: ["accounts.google.com", "*.googleusercontent.com"],
  },
  ios: {
    contentInset: "automatic",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
