#!/usr/bin/env node
// Import a DiscordChatExporter (DCE) JSON export of the Marek DM into the
// Obsidian archive layer at marek-vault/archive/.
//
//   node scripts/import-marek-chat.mjs
//
// Reads every *.json in marek-vault/_raw/ (DCE JSON, exported with --media),
// writes one note per calendar day to marek-vault/archive/YYYY-MM-DD.md, copies
// message media into marek-vault/attachments/, and stamps a ^msg-<id> block
// anchor on every message so knowledge notes can cite the exact source.
//
// Idempotent: a run fully regenerates archive/ and refreshes attachments/. It
// never writes into knowledge/, questions/, or templates/. Re-export, re-run.
//
// Zero external deps (node: builtins only), matching scripts/status.mjs style.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  rmSync,
  statSync,
} from 'node:fs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const VAULT = path.resolve(SCRIPT_DIR, '..', 'marek-vault');
const RAW_DIR = path.join(VAULT, '_raw');
const ARCHIVE_DIR = path.join(VAULT, 'archive');
const ATTACH_DIR = path.join(VAULT, 'attachments');

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif']);

function die(msg) {
  console.error(`\n  import-marek-chat: ${msg}\n`);
  process.exit(1);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function hhmmss(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// --- media -----------------------------------------------------------------

const attachmentUsed = new Map(); // resolvedSourcePath -> vault-relative filename
const hashToName = new Map(); // contentHash -> filename already written
let remoteMediaWarned = 0;
let copiedCount = 0;

function sanitizeName(name) {
  return name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_');
}

// Given a DCE attachment/embed url (a local relative path when --media was used,
// or an http(s) URL when it was not) and the directory of the JSON file it came
// from, return { embedTarget, isImage } where embedTarget is either an
// attachments/<file> vault path (local, copied) or the original URL (remote).
function resolveMedia(url, jsonDir) {
  if (!url) return null;
  const isRemote = /^https?:\/\//i.test(url);
  if (isRemote) {
    remoteMediaWarned++;
    return { embedTarget: url, isImage: false, remote: true };
  }

  const decoded = decodeURIComponent(url);
  const src = path.resolve(jsonDir, decoded);
  if (!existsSync(src)) {
    remoteMediaWarned++;
    return { embedTarget: url, isImage: false, remote: true, missing: true };
  }

  if (attachmentUsed.has(src)) {
    const name = attachmentUsed.get(src);
    return { embedTarget: `attachments/${name}`, isImage: IMAGE_EXT.has(path.extname(name).toLowerCase()) };
  }

  const buf = readFileSync(src);
  const hash = crypto.createHash('sha1').update(buf).digest('hex');
  if (hashToName.has(hash)) {
    const name = hashToName.get(hash);
    attachmentUsed.set(src, name);
    return { embedTarget: `attachments/${name}`, isImage: IMAGE_EXT.has(path.extname(name).toLowerCase()) };
  }

  const base = sanitizeName(path.basename(src));
  let name = base;
  // Distinct content but colliding name: suffix a short hash before the ext.
  if (existsSync(path.join(ATTACH_DIR, name))) {
    const ext = path.extname(base);
    const stem = base.slice(0, base.length - ext.length);
    name = `${stem}-${hash.slice(0, 8)}${ext}`;
  }
  mkdirSync(ATTACH_DIR, { recursive: true });
  copyFileSync(src, path.join(ATTACH_DIR, name));
  copiedCount++;
  attachmentUsed.set(src, name);
  hashToName.set(hash, name);
  return { embedTarget: `attachments/${name}`, isImage: IMAGE_EXT.has(path.extname(name).toLowerCase()) };
}

// --- content cleanup -------------------------------------------------------

// Map raw Discord tokens (<@id>, <#id>, <:name:id>) to readable text. Keeps
// code fences untouched by operating only outside them.
function cleanupContent(content, nameById) {
  if (!content) return '';
  const parts = content.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return parts
    .map((seg, i) => {
      if (i % 2 === 1) return seg; // inside code span/fence: verbatim
      return seg
        .replace(/<a?:(\w+):\d+>/g, ':$1:')
        .replace(/<@!?(\d+)>/g, (_, id) => `@${nameById.get(id) || id}`)
        .replace(/<#(\d+)>/g, '#channel')
        .replace(/<@&(\d+)>/g, '@role');
    })
    .join('');
}

// --- rendering -------------------------------------------------------------

function renderReactions(reactions) {
  if (!reactions || !reactions.length) return '';
  const parts = reactions.map((r) => {
    const name = r.emoji?.name || r.emoji?.id || '?';
    return `${name} ×${r.count}`;
  });
  return `reactions: ${parts.join(' · ')}`;
}

function renderMessage(msg, jsonDir, nameById) {
  const ts = new Date(msg.timestamp);
  const author = msg.author?.nickname || msg.author?.name || msg.author?.id || 'unknown';
  const lines = [];
  lines.push(`### ${hhmmss(ts)} — ${author}`);

  if (msg.reference?.messageId) {
    lines.push(`> ↪ in reply to \`^msg-${msg.reference.messageId}\``);
    lines.push('');
  }

  const body = cleanupContent(msg.content, nameById).trim();
  if (body) lines.push(body);

  // Attachments.
  const media = [];
  for (const att of msg.attachments || []) {
    const r = resolveMedia(att.url, jsonDir);
    if (!r) continue;
    const label = att.fileName || path.basename(r.embedTarget);
    if (r.remote) {
      media.push(`- [${label}](${r.embedTarget})${r.missing ? ' *(media not downloaded)*' : ''}`);
    } else if (r.isImage) {
      media.push(`- ![[${r.embedTarget}]]`);
    } else {
      media.push(`- [[${r.embedTarget}]] — ${label}`);
    }
  }

  // Embeds (link previews, image links). Keep compact.
  for (const emb of msg.embeds || []) {
    const imgUrl = emb.image?.url || emb.thumbnail?.url;
    if (imgUrl) {
      const r = resolveMedia(imgUrl, jsonDir);
      if (r && !r.remote && r.isImage) media.push(`- ![[${r.embedTarget}]]`);
      else if (r && r.remote) media.push(`- [embed image](${r.embedTarget})`);
    }
    if (emb.url && emb.title) media.push(`- embed: [${emb.title}](${emb.url})`);
  }

  if (media.length) {
    if (body || lines.length > 1) lines.push('');
    lines.push('📎', ...media);
  }

  const reactionLine = renderReactions(msg.reactions);
  if (reactionLine) {
    lines.push('');
    lines.push(reactionLine);
  }

  // Block anchor: a stable per-message id for citation from knowledge notes.
  lines.push('');
  lines.push(`^msg-${msg.id}`);
  lines.push('');
  return lines.join('\n');
}

// --- main ------------------------------------------------------------------

function main() {
  if (!existsSync(RAW_DIR)) {
    die(`no _raw/ folder found at ${RAW_DIR}\n  Export first — see marek-vault/how-to-export.md`);
  }
  const jsonFiles = readdirSync(RAW_DIR)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .map((f) => path.join(RAW_DIR, f));
  if (!jsonFiles.length) {
    die(`no *.json in ${RAW_DIR}\n  Export first — see marek-vault/how-to-export.md`);
  }

  // Collect + de-duplicate messages across (possibly chunked) exports.
  const byId = new Map();
  const messageDir = new Map(); // message id -> the json dir it came from (for media)
  const nameById = new Map();
  const sources = [];
  let skipped = 0;

  for (const file of jsonFiles) {
    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      console.warn(`  ! skipping unreadable JSON: ${path.basename(file)} (${e.message})`);
      continue;
    }
    if (!Array.isArray(data.messages)) {
      console.warn(`  ! ${path.basename(file)} has no messages[] — skipping`);
      continue;
    }
    sources.push(path.basename(file));
    const jsonDir = path.dirname(file);
    for (const msg of data.messages) {
      if (!msg || !msg.id || !msg.timestamp) {
        skipped++;
        continue;
      }
      if (msg.author?.id) {
        nameById.set(msg.author.id, msg.author.nickname || msg.author.name || msg.author.id);
      }
      for (const m of msg.mentions || []) {
        if (m.id) nameById.set(m.id, m.nickname || m.name || m.id);
      }
      if (!byId.has(msg.id)) {
        byId.set(msg.id, msg);
        messageDir.set(msg.id, jsonDir);
      }
    }
  }

  const messages = [...byId.values()].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
  );
  if (!messages.length) die('parsed 0 usable messages — is this a DCE JSON export?');

  // Regenerate archive/ from scratch (idempotent).
  if (existsSync(ARCHIVE_DIR)) rmSync(ARCHIVE_DIR, { recursive: true, force: true });
  mkdirSync(ARCHIVE_DIR, { recursive: true });

  // Group by local calendar day.
  const days = new Map();
  for (const msg of messages) {
    const key = dayKey(new Date(msg.timestamp));
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(msg);
  }

  const participants = [...new Set(messages.map((m) => m.author?.nickname || m.author?.name).filter(Boolean))];

  for (const [day, dayMsgs] of days) {
    const front = [
      '---',
      `date: ${day}`,
      `message_count: ${dayMsgs.length}`,
      `participants: [${participants.map((p) => JSON.stringify(p)).join(', ')}]`,
      `source_export: [${sources.map((s) => JSON.stringify(s)).join(', ')}]`,
      'layer: archive',
      '---',
      '',
      `# ${day}`,
      '',
      `> Generated from the DiscordChatExporter export by \`scripts/import-marek-chat.mjs\`.`,
      `> Times are your machine's local time. Cite a message elsewhere with \`![[archive/${day}#^msg-<id>]]\`.`,
      '',
    ];
    const rendered = dayMsgs.map((m) => renderMessage(m, messageDir.get(m.id), nameById));
    writeFileSync(path.join(ARCHIVE_DIR, `${day}.md`), front.join('\n') + '\n' + rendered.join('\n') + '\n');
  }

  // A tiny index note that sorts to the top of archive/.
  const idxLines = [
    '---',
    'layer: archive',
    '---',
    '',
    '# Chat archive — index',
    '',
    `Generated ${messages.length} messages across ${days.size} days.`,
    '',
  ];
  for (const [day, dayMsgs] of [...days.entries()].sort()) {
    idxLines.push(`- [[archive/${day}|${day}]] — ${dayMsgs.length} messages`);
  }
  writeFileSync(path.join(ARCHIVE_DIR, '000-index.md'), idxLines.join('\n') + '\n');

  // Summary.
  console.log('');
  console.log(`  imported ${messages.length} messages → ${days.size} daily notes`);
  console.log(`  attachments copied: ${copiedCount}`);
  if (skipped) console.log(`  messages skipped (missing id/timestamp): ${skipped}`);
  if (remoteMediaWarned) {
    console.log(
      `  ⚠ ${remoteMediaWarned} media left as remote links — re-export with --media to download them`,
    );
  }
  console.log(`  archive: marek-vault/archive/   attachments: marek-vault/attachments/`);
  console.log('');
}

main();
