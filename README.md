# Asteroid OS One v0.99.23.7 — Asteroid ONE GitHub Pages release

This build preserves the v0.99.23.4 performance and direct-username changes and
includes laptop-backed MessageX media storage, FreePeriod, MessageX, and the
complete Asteroid Browser runtime.

## Asteroid ONE laptop storage

- The Files app is now the Asteroid ONE account drive. New imported files,
  camera captures, and Photos content are saved permanently under the
  normal-user laptop service's separate `storage\asteroid-one` directory.
- Files are account-scoped. A user can sign in on a phone, tablet, Chromebook,
  or another computer, see the same folder structure and timestamps, and open
  the permanent laptop copy through a short-lived protected ticket.
- If the laptop or Cloudflare tunnel is unavailable, the browser uploads the
  file to a private temporary Supabase queue. The laptop polls every five
  seconds, saves the exact bytes atomically, verifies both length and SHA-256,
  updates the stable file record, and only then deletes the temporary object.
- System settings, Notes, Contacts, Photos metadata, the Files manifest, and a
  Shards status summary are included in an account-scoped recovery snapshot on
  Asteroid ONE. Supabase remains the normal cross-device synchronization and
  authentication system, so the app still works while the laptop is offline.
- Passwords, Supabase sessions, bearer tokens, and Gemini API keys are never
  written into an Asteroid ONE account snapshot.
- Asteroid ONE is laptop storage, not permanent cloud storage. Back up
  `storage\asteroid-one` and `storage\chat-media` as part of normal laptop
  backups.

## Asteroid Browser and GitHub Pages

- `asteroid-browser/` contains the complete project-path-safe browser bundle:
  Scramjet, the controller and service worker, the WebAssembly rewriter,
  locally bundled Libcurl and Epoxy transports, and all required notices.
- The Browser accepts Asteroid OS One's short-lived Shards access handoff and can
  open either the full browser interface or an OS-launched web app target.
- Its 16-profile per-site compatibility engine learns and remembers the best
  working transport/header/rewriter combination for each host. These local site
  blueprints do not expose a user's browsing history to Supabase.
- The background-research bridge can gather live Wikipedia results and return
  sources to the Asteroid OS One assistant without blocking the visible Browser.
- A bundled compatibility runtime is available automatically if the normal
  Scramjet runtime cannot load.
- Relative asset paths and the included `.nojekyll` files allow the complete OS
  and Browser service worker to run from a GitHub Pages project subdirectory.
- All Browser-facing labels, internal Asteroid storage keys, and release
  validators use Asteroid Browser naming only.
- When Asteroid Browser opens a secure `ixl.com` page, it automatically loads
  the bundled IXL Answer Helper supplied for this release. The helper receives
  persistent isolated settings and uses the Browser's Libcurl/Epoxy transport
  for its Mistral, Supabase-cache, and other userscript HTTP requests. It is not
  injected into any non-IXL website.

## Supabase Auth security upgrade

- Asteroid OS One now verifies every restored session against Supabase Auth's
  `/auth/v1/user` endpoint before the desktop can open.
- The returned Supabase user ID must match the profile's `auth_user_id`; cached
  usernames and user-editable metadata are not authorization evidence.
- Expiring sessions refresh early and the refreshed token is verified before
  it is saved.
- Temporary network failures and verification timeouts preserve the saved
  session; only a definitive Supabase Auth rejection signs the user out.
- New accounts are created by a Supabase Edge Function through the official
  server-only Supabase Auth Admin API. The old browser-callable direct-table
  signup RPC is disabled.
- Lock-screen password checks are performed by Supabase Auth.
- Log Out and Switch User revoke the current Supabase session before clearing
  the device copy.
- Legacy token mirrors in `localStorage`, `window.name`, and browser history
  are migrated and removed. See `SUPABASE_SECURITY.md`.

## MessageX media change

- New MessageX photos, videos, drawings, and voice/audio files upload to the
  owner's laptop instead of the Supabase `chat-media` bucket.
- Profile photos use the same laptop-backed storage and protected ticket flow.
- If the laptop is unavailable, MessageX places the media in the private
  `messagex-media-queue` Supabase bucket and creates the durable message (or
  profile update) with its original timestamp. The laptop checks every five
  seconds after it starts, saves and SHA-256-verifies the bytes, changes the
  logical reference to the permanent laptop path, and only then deletes the
  temporary Supabase object.
- Supabase continues to store accounts, chats, message rows, realtime events,
  the permanent media gateway, and the laptop's online heartbeat. It remains
  the only account and password authority.
- Existing Supabase media URLs are unchanged and still render.
- New media rows use a logical `messagex-laptop:` path. MessageX resolves that
  path through `https://messagex-media.asteroid-messagex.workers.dev`, the
  permanent Cloudflare gateway stored in `media_storage_config`.
- This build pins authenticated media requests to that exact HTTPS origin. It
  still reads Supabase for the laptop's online state and timestamps, but a
  different registry hostname cannot receive a user's bearer session.
- The permanent gateway has a private Cloudflare Workers VPC binding to the
  persistent `messagex-storage` named tunnel. There is no rotating
  `trycloudflare.com` hostname and no inbound router or Windows Firewall rule.
- Both Supabase gateway fields publish the same permanent HTTPS address. Old
  message rows do not need rewriting when Windows or the tunnel process restarts.
- A media request now retries the Supabase registry lookup and gateway request
  together up to three times (immediately, after 750 ms, and after 2 seconds).
  This prevents a short connector reconnect from aborting a photo with the raw
  browser `Failed to fetch` error.
- Uploads require a valid Supabase Auth session and membership in the target
  MessageX chat.
- Downloads also require the signed-in Supabase user to be a current member of
  the chat. MessageX requests a short-lived signed URL through an authenticated
  POST ticket request; raw laptop media paths are not public. The legacy GET
  ticket route remains available for older clients.
- Laptop-backed profile photos also require a signed-in MessageX session; raw
  profile-media paths are not public.
- Username/password login remains handled by Supabase Auth. The laptop receives
  only the resulting access token and never receives or saves a password.
- Protected media can be forwarded only after the laptop verifies the sender is
  a member of both the source and destination chats.

The laptop service stores MessageX media, Asteroid ONE Files, and account
recovery snapshots; it does not host this `index.html`.
Open or host Asteroid OS One separately. MessageX discovers the current media API
through Supabase, and the laptop server supports the required cross-origin
browser requests. The desktop MessageX app, Contacts, MessageX notifications,
and Comet all use the same validated client embedded in this complete Asteroid
OS build. See `LAPTOP_STORAGE.md`.

## Restart persistence

The normal-user supervisor starts automatically after the Windows owner signs
in. It restarts the server, the same named-tunnel connector, and the Supabase
heartbeat without hosting Asteroid OS One itself. Supabase retains accounts, chats,
messages, and Asteroid OS One sync data; the laptop retains media under
`storage\chat-media` and account files under `storage\asteroid-one`. A reboot
replaces only disposable process IDs; the tunnel
UUID and permanent `workers.dev` gateway address do not change. See
`RESTART_RECOVERY_TEST.json` for the forced recovery validation performed on
2026-08-06.

## Preserved performance behavior

Revamped AI remains enabled by default. The existing performance pass keeps:

- performance-first automatic mode on phones and weak devices;
- no startup decoding or warm-up of the bundled intent model on lite devices;
- no large local language model on lite devices;
- instant action presentation by default on lite devices;
- delayed/idle Notes memory synchronization;
- Asteroid Browser for live web knowledge;
- Gemini API as optional cloud computing; and
- silent MessageX sending with an exact top confirmation banner.

## Comet live voice reliability

- Tapping Comet's voice button now requests microphone permission immediately
  while the browser still recognizes the user gesture. This restores the
  permission prompt on Android, WebView-based launchers, and mobile Chromium.
- The temporary permission-check stream is released before Web Speech opens the
  microphone, avoiding the competing-capture failure that left Comet listening
  without receiving speech on some devices.
- Enhanced microphone constraints fall back to basic audio, and denied,
  missing, busy, or unsupported microphones now show a specific recovery
  message instead of silently stopping.

## Direct MessageX usernames

Comet does not require recipients to be saved in Asteroid Contacts. Commands
such as `message henry saying hello` and `message @henry saying hello` send
directly to the MessageX username `henry`. Asteroid Contacts remain optional and
can provide friendly display-name aliases.
