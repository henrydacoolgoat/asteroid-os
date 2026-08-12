# Asteroid ONE and laptop-backed MessageX storage

## No administrator access required

The MessageX storage server runs as the normal Windows user. It does not install
a Windows service, request elevation, add a firewall rule, or modify the router.
It binds only to `127.0.0.1:8787`, and `cloudflared` creates an outbound tunnel.
The hidden launcher is in the current user's Windows Startup folder and starts
after that user signs in. A matching current-user `HKCU\...\Run` entry provides
a second no-admin sign-in trigger; the supervisor's single-instance lock makes
the duplicate launch harmless. A limited-user scheduled watchdog runs every
five minutes after sign-in and relaunches the supervisor if it is missing.

The currently installed service lives at:

`C:\Users\henry_x0k28gt\Downloads\New folder (4)\local-storage`

## Opening Asteroid OS

The laptop service does not serve this package's `index.html`; it is the private
Asteroid ONE and MessageX storage backend. Open or host Asteroid OS separately. The MessageX client discovers the
permanent media gateway through the singleton Supabase row
`public.media_storage_config`, and the media server allows the required
cross-origin browser requests.

This works when `index.html` is hosted on GitHub Pages: GitHub serves the app
over HTTPS, `https://messagex-media.asteroid-messagex.workers.dev` is also HTTPS,
and both Supabase and the permanent gateway answer the required CORS preflights.
Do not hard-code a Quick Tunnel hostname into the GitHub Pages copy.

The Cloudflare Worker domain is stable. Its private `LAPTOP_VPC` binding targets
the persistent `messagex-storage` named-tunnel UUID and forwards requests to
`127.0.0.1:8787` through Cloudflare's network. The connector makes only an
outbound connection, so this setup needs no router port forwarding, public IP,
Windows service, firewall exception, or administrator access. No account-less
Quick Tunnel or random `trycloudflare.com` hostname is used. The no-admin
connector uses HTTP/2 edge transport because this network showed intermittent
QUIC/UDP timeouts; the public client URL is unchanged.

On recovery, the heartbeat keeps both `endpoint_url` and `public_gateway_url`
set to the permanent Worker address and updates the online state and timestamps.
MessageX re-reads the singleton registry when needed. Existing message rows keep
logical `messagex-laptop:` paths, so a Windows or tunnel-process restart never
requires rewriting old messages.

The packaged client retries both the registry lookup and the media request in a
single bounded attempt sequence. When the laptop stays unavailable, it uploads
the bytes to the private Supabase `messagex-media-queue` bucket. Supabase creates
the durable queued message with the original send timestamp. The laptop checks
for work every five seconds after startup, streams the object to disk, verifies
its byte count and SHA-256 checksum, changes the message to a stable
`messagex-laptop:` reference, and only then deletes the temporary cloud object.
Profile photos use the same process and become protected
`messagex-profile-laptop:` references.

The packaged MessageX client pins authenticated media requests to
`https://messagex-media.asteroid-messagex.workers.dev`. Supabase must advertise
that origin and report the laptop online before the client sends a request. This
prevents a changed registry hostname from receiving a user's bearer token.

Recipient presence is not required. MessageX stores the message row durably in
Supabase even when the other user is signed out or has the app closed. When that
user opens MessageX again—or an open copy reconnects—the active chat reloads its
durable message history from Supabase and requests a fresh, short-lived media
ticket from the laptop service.

The same account can be used on multiple devices. Each login reloads that
account's chat list from Supabase, and opening a chat reloads its durable message
rows, including the sender and original `created_at` timestamp. Media sent from
one device therefore appears as a sent item with the original send time on the
account's other devices, while every device retrieves the bytes from this one
laptop-backed media service.

The image, audio, or video bytes are written atomically under
`storage\chat-media\` on this laptop. The laptop and tunnel can be off at send
time: the private Supabase queue holds the temporary copy until automatic
recovery. The laptop and tunnel must be online when another device views the
final protected media. The recipient does not need to be online at send time.

## Asteroid ONE Files and settings

Asteroid ONE extends the same no-admin laptop service to the Asteroid OS Files,
Photos, Camera, Settings, Notes, and Contacts experience:

- New Files imports and camera captures are written atomically beneath
  `storage\asteroid-one\`. This directory is separate from MessageX media.
- Supabase stores account-owned file and folder metadata so all devices signed
  into the same account see the same names, paths, sizes, and timestamps.
- The file bytes remain on this laptop. A different device gets only a
  short-lived signed download ticket after the laptop verifies its Supabase
  account token and ownership of the requested file.
- If the laptop is offline at upload time, the private
  `messagex-media-queue` bucket carries the temporary Asteroid ONE object. Its
  path is restricted to the signed-in account. The laptop claims work through
  a service-only function, verifies the byte length and SHA-256, switches the
  file to a stable `asteroid-one:` reference, and deletes the temporary object.
- The laptop checks the queue every five seconds. The web app also retries on
  reconnect, focus, visibility change, and a 30-second signed-in sync interval.
- Supported Settings, Notes, Contacts, Photos metadata, the Files manifest, and
  a Shards status summary are saved in an account-specific JSON snapshot under
  the Asteroid ONE directory. Passwords, access tokens, session data, and the
  Gemini API key are intentionally excluded.
- Supabase remains the live cross-device sync and authentication authority.
  The Asteroid ONE snapshot is the laptop copy and recovery record; it does not
  turn the laptop into an account or password server.

The permanent Asteroid ONE directory and account-state files should be included
in laptop backups. The private Supabase queue is temporary transport, not a
backup, and is designed to empty after verified recovery.

## Upload behavior

- The MessageX client uploads one `file` field as `multipart/form-data` over HTTP; the server also keeps accepting the previous raw-media request shape for older clients.
- Media requests use five bounded attempts so a brief tunnel reconnection or Cloudflare edge failure does not immediately fail a send.
- Maximum file size: 100 MB.
- Accepted content: common image, video, and audio MIME types.
- Rejected content: HTML, JavaScript, SVG, executables, and non-media files.
- Required access: a live MessageX Supabase Auth session and membership in the
  destination chat.
- Username/password authentication is performed by Supabase Auth using
  MessageX's internal username identity. The laptop sees only a bearer access
  token, never the password.
- Downloads require a one-hour signed media ticket issued only after the laptop
  verifies the Supabase username is currently in that chat's `members` array.
- Direct-chat media is available only to the members of that direct chat.
  Group-chat media is available only to the members of that group.
- Unsigned, modified, or expired `/media/...` URLs return HTTP 403.
- Forwarding protected media grants the destination chat access only after the
  user is verified as a member of both chats.
- New bytes: `local-storage\storage\chat-media`.
- Existing Supabase Storage objects: left unchanged.
- Offline fallback objects are private and temporary; they are removed only
  after the laptop reports the matching size and SHA-256 checksum.

The laptop must remain plugged in, signed in, awake, online, and ventilated.
Closing the lid and ordinary sleep/hibernate timers are disabled on AC and
battery. Critical-battery protection is preserved, so a drained battery can
still stop the server. Never operate the closed laptop in a bag or enclosed
space.

Back up `local-storage\storage\chat-media` and
`local-storage\storage\asteroid-one` regularly. The Supabase queue is a
delivery buffer, not a backup: its temporary copy is deleted after the laptop
verifies the permanent file. Back up the local `config\media-signing-secret.txt`
with the media directory.

Supabase retains accounts, chats, message rows, chat membership, and Asteroid OS
sync records across laptop restarts. The laptop retains its media directory and
signing secret. Files under `run\` are disposable runtime state and are rebuilt
automatically. Automatic startup occurs after this Windows user signs in; a true
pre-login Windows service would require administrator privileges and is
intentionally not installed.
