// One-off: connect the delegations Google Calendar to the portal.
//
//   npm run calendar:auth
//
// Opens Google in your browser. Sign in as the calendar owner and click Allow.
// The refresh token is saved to .env.local as GOOGLE_OAUTH_REFRESH_TOKEN.
// Copy it to Vercel too. Run this again any time the calendar says to reconnect.

import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import nextEnv from "@next/env";

const root = process.cwd();
nextEnv.loadEnvConfig(root);

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const ENV_FILE = path.join(root, ".env.local");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("\nAdd GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to .env.local first (see the README).\n");
  process.exit(1);
}

const state = randomBytes(16).toString("hex");
const verifier = randomBytes(48).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }

  const finish = (status, message, ok = false) => {
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<body style="font-family:system-ui;max-width:520px;margin:80px auto;text-align:center;color:#1c1433">` +
        `<h1 style="color:${ok ? "#15805a" : "#c43a3a"}">${ok ? "Calendar connected" : "Didn't connect"}</h1>` +
        `<p>${message}</p><p style="color:#6b6383">You can close this tab.</p></body>`,
    );
    setTimeout(() => server.close(() => process.exit(ok ? 0 : 1)), 300);
  };

  if (url.searchParams.get("state") !== state) return finish(400, "The sign-in didn't match. Run the script again.");
  const error = url.searchParams.get("error");
  if (error) return finish(400, `Google said: ${error}`);

  const { port } = server.address();
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: url.searchParams.get("code") ?? "",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: `http://127.0.0.1:${port}/callback`,
      code_verifier: verifier,
    }),
  });
  const body = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !body.refresh_token) {
    console.error("\nGoogle didn't return a refresh token:", body.error_description ?? body.error ?? tokenRes.status);
    return finish(400, "Google didn't return a refresh token. Check the terminal.");
  }

  // Check the signed-in account can actually read the calendar.
  if (CALENDAR_ID) {
    const check = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?maxResults=1`,
      { headers: { Authorization: `Bearer ${body.access_token}` } },
    );
    if (!check.ok) {
      console.error(`\nSigned in, but that account can't read ${CALENDAR_ID} (Google returned ${check.status}).`);
      return finish(400, `That Google account can't read ${CALENDAR_ID}. Sign in as the calendar owner.`);
    }
  }

  saveToken(body.refresh_token);
  console.log("\n✓ Calendar connected. The refresh token is saved in .env.local as GOOGLE_OAUTH_REFRESH_TOKEN.");
  console.log("  Restart `npm run dev`, and add the same value in Vercel → Settings → Environment Variables.\n");
  finish(200, "The portal can now show the delegations calendar to everyone with access.", true);
});

function saveToken(token) {
  const line = `GOOGLE_OAUTH_REFRESH_TOKEN=${token}`;
  let text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  if (/^GOOGLE_OAUTH_REFRESH_TOKEN=.*$/m.test(text)) {
    text = text.replace(/^GOOGLE_OAUTH_REFRESH_TOKEN=.*$/m, line);
  } else {
    text = `${text.replace(/\n*$/, "\n")}${line}\n`;
  }
  writeFileSync(ENV_FILE, text);
}

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `http://127.0.0.1:${port}/callback`,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(CALENDAR_ID ? { login_hint: CALENDAR_ID } : {}),
  }).toString();

  console.log("\nOpening Google sign-in. Sign in as the calendar owner and click Allow.");
  console.log("If the browser doesn't open, copy this link into it:\n");
  console.log(auth.toString(), "\n");

  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  spawn(opener, [auth.toString()], { stdio: "ignore", detached: true }).on("error", () => {});
});
