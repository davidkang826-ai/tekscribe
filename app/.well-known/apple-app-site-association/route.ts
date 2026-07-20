export const runtime = "nodejs";

/**
 * Apple App Site Association: tells iOS that links on this domain open the
 * TekScribe app (Universal Links). Requires APPLE_TEAM_ID in the environment
 * and the Associated Domains capability (applinks:tekscribe.io) in Xcode.
 * Served at /.well-known/apple-app-site-association with no file extension.
 */
export async function GET() {
  const teamId = process.env.APPLE_TEAM_ID;
  if (!teamId) {
    return new Response("APPLE_TEAM_ID not configured", { status: 404 });
  }
  const appID = `${teamId}.io.tekscribe.app`;
  return Response.json({
    applinks: {
      details: [
        {
          appIDs: [appID],
          components: [
            { "/": "/auth/confirm*" },
            { "/": "/reset-password*" },
            { "/": "/notes/*" },
          ],
        },
      ],
    },
    webcredentials: { apps: [appID] },
  });
}
