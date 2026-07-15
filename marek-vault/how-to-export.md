---
layer: index
---

# How to export the chat and import it here

You run the export locally; this repo only holds the tooling. Verified against DiscordChatExporter
docs on 2026-07-16.

> **Discord's own warning, passed through verbatim:** "Automating user accounts violates Discord's
> terms of service and may result in account termination. Use at your own risk." Exporting your own
> DMs with a user token is standard for personal archival and essentially never enforced, but it is
> not officially sanctioned. If you want a zero-ToS-risk route instead, use Discord's official
> Settings → Data & Privacy → "Request my Data" and adapt the importer to that format later.

## 1. Get your user token (macOS)

1. Open Discord in a browser (app.discord.com), logged in.
2. Press ⌥ + ⌘ + I to open developer tools, click the **Console** tab.
3. Paste this and press Enter:

   ```js
   let m;webpackChunkdiscord_app.push([[Math.random()],{},e=>{for(let i in e.c){let x=e.c[i];if(x?.exports?.getToken){m=x;break}}}]);m&&console.log("Token:",m.exports.getToken());
   ```

4. Copy the printed token. **Treat it like your password.** Do not paste it into any file, commit it,
   or share it. You can invalidate it at any time by changing your Discord password.

## 2. Get the DM channel id

1. Discord → Settings → **Advanced** → enable **Developer Mode**.
2. Open your DM with Marek, right-click his name in the DM list → **Copy Channel ID**.

## 3. Export into `_raw/`

Keep the token out of your shell history by reading it into a variable first:

```sh
cd /path/to/TilingAtlas
mkdir -p marek-vault/_raw
read -rs TOKEN        # paste the token, press Enter (input is hidden)
CHANNEL=your_channel_id_here
```

Then pick one of the two routes.

**Docker (recommended — no .NET install):**

```sh
docker run --rm -v "$PWD/marek-vault/_raw:/out" tyrrrz/discordchatexporter:stable \
  export -t "$TOKEN" -c "$CHANNEL" -f Json --media --reuse-media -o /out/
```

**Native CLI (needs the .NET runtime):**

```sh
brew install dotnet-sdk        # .NET 6.0+ runtime, one time
# download DiscordChatExporter.Cli.*.zip from the project's Releases page, unzip, then:
dotnet DiscordChatExporter.Cli.dll \
  export -t "$TOKEN" -c "$CHANNEL" -f Json --media --reuse-media -o marek-vault/_raw/
```

Flags: `-f Json` (structured, best for parsing), `--media` downloads images and file attachments,
`--reuse-media` skips re-downloading on later runs. Add `--after 2025-01-01` / `--before ...` to limit
the date range.

## 4. Import into the vault

From the repo root:

```sh
node scripts/import-marek-chat.mjs
```

It writes `marek-vault/archive/YYYY-MM-DD.md` (one per day) and copies media into
`marek-vault/attachments/`. Re-runnable: it regenerates the archive from scratch each time and never
touches your `knowledge/` notes.

## Re-exporting later

Export again into `marek-vault/_raw/` and re-run the importer. Clear `_raw/` first if you want a clean
full export; the importer de-duplicates by message id, so overlapping exports are safe either way.
Because `_raw/`, `archive/`, and `attachments/` are gitignored, none of this enters git — only your
curated notes do.
