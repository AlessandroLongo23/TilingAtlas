// The shipped data (public/**/*.json.br) lives in the R2 bucket behind data.thetilingatlas.com, which is its
// master copy: git does not track it (CLAUDE.md, "Shipped data under public/"). public/ holds a local copy that
// development reads and builds generate from; production reads the bucket (lib/services/atlasCodec.ts fetchData).
// Files are compared by MD5 (an object's ETag), and objects are never deleted: one that left public/ stays until
// removed by hand, which costs storage and nothing else.
//
//   pnpm data:sync            publish: upload every local file that is new or changed
//   pnpm data:sync --check    list what would be uploaded, upload nothing
//   pnpm data:pull            download every file missing locally; one that differs is reported, never overwritten
//   node scripts/data-sync.mjs --vercel   the last build step: production uploads what the build generated
//                                          (hero cells, update cells), then every Vercel build prunes the data
//
// Credentials, never PUBLIC_*: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (an R2 API token with
// Object Read & Write on the bucket), from .env.local here and the project settings on Vercel.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AwsClient } from "aws4fetch";

const BUCKET = "tiling-atlas-data";
const PUBLIC = path.join(process.cwd(), "public");
const args = process.argv.slice(2);
// Vercel's own build container (/vercel/path0). `vercel build` on a laptop sets VERCEL too, and pruning there
// would delete the working tree's only copy of what has not been published.
const onVercel = Boolean(process.env.VERCEL) && process.cwd().startsWith("/vercel/");

/** Every shipped data file, by its key in the bucket (its path under public/). */
const localKeys = (dir = PUBLIC) =>
	fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) return localKeys(p);
		return e.name.endsWith(".json.br") ? [path.relative(PUBLIC, p).split(path.sep).join("/")] : [];
	});
const md5 = (key) => crypto.createHash("md5").update(fs.readFileSync(path.join(PUBLIC, key))).digest("hex");

function client() {
	const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey } = process.env;
	if (!account || !accessKeyId || !secretAccessKey) return null;
	const aws = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
	const base = `https://${account}.r2.cloudflarestorage.com/${BUCKET}`;
	return { aws, url: (key = "") => `${base}/${key.split("/").map(encodeURIComponent).join("/")}` };
}
const NO_KEYS = "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set (.env.local, or the Vercel project)";

/** key -> MD5 hex of every object in the bucket. */
async function remoteEtags({ aws, url }) {
	const etags = new Map();
	for (let token = ""; ; ) {
		const q = `?list-type=2&max-keys=1000${token && `&continuation-token=${encodeURIComponent(token)}`}`;
		const res = await aws.fetch(url() + q);
		if (!res.ok) throw new Error(`listing ${BUCKET}: HTTP ${res.status} ${await res.text()}`);
		const xml = await res.text();
		for (const [, key, etag] of xml.matchAll(/<Key>([^<]*)<\/Key>.*?<ETag>(?:&quot;|")?([0-9a-f]+)/gs))
			etags.set(key.replace(/&amp;/g, "&"), etag);
		token = /<NextContinuationToken>([^<]*)</.exec(xml)?.[1] ?? "";
		if (!token) return etags;
	}
}

/** `job` over `keys`, 16 at a time, with a progress line every 1,000. */
async function each(keys, verb, job) {
	const queue = [...keys];
	let done = 0;
	const worker = async () => {
		for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
			await job(key);
			if (++done % 1000 === 0 || done === keys.length) console.log(`data-sync: ${done}/${keys.length} ${verb}`);
		}
	};
	await Promise.all(Array.from({ length: 16 }, worker));
}

async function upload(r2) {
	const remote = await remoteEtags(r2);
	const keys = localKeys();
	const changed = keys.filter((k) => remote.get(k) !== md5(k));
	console.log(`data-sync: ${keys.length} local files, ${changed.length} to upload`);
	if (args.includes("--check")) return changed.forEach((k) => console.log(`  ${k}`));
	await each(changed, "uploaded", async (key) => {
		const res = await r2.aws.fetch(r2.url(key), {
			method: "PUT",
			body: fs.readFileSync(path.join(PUBLIC, key)),
			headers: { "Content-Type": "application/octet-stream" },
		});
		if (!res.ok) throw new Error(`uploading ${key}: HTTP ${res.status} ${await res.text()}`);
	});
}

async function pull(r2) {
	const remote = await remoteEtags(r2);
	const local = new Set(localKeys());
	const missing = [...remote.keys()].filter((k) => !local.has(k));
	const differ = [...remote.keys()].filter((k) => local.has(k) && remote.get(k) !== md5(k));
	console.log(`data-sync: ${remote.size} files in R2, ${missing.length} to download`);
	// Not overwritten: a local file that differs is either newer work not yet published or an old copy, and
	// only its owner can tell which.
	if (differ.length) console.log(`data-sync: ${differ.length} local files differ from R2, left alone: ${differ.slice(0, 5).join(", ")}`);
	await each(missing, "downloaded", async (key) => {
		const res = await r2.aws.fetch(r2.url(key));
		if (!res.ok) throw new Error(`downloading ${key}: HTTP ${res.status}`);
		const file = path.join(PUBLIC, key);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
	});
}

const r2 = client();
if (args.includes("--pull")) {
	// The first build step: builds generate from the data, and a clone or a Vercel container starts without it.
	if (r2) await pull(r2);
	else if (onVercel) throw new Error(NO_KEYS);
	else console.log(`data-sync: no R2 keys, building from public/ as it is (${NO_KEYS})`);
} else if (!args.includes("--vercel")) {
	if (!r2) throw new Error(NO_KEYS);
	await upload(r2);
} else if (onVercel) {
	// Only with PUBLIC_DATA_URL set, or the deployment would fetch from itself the files it no longer has.
	if (!process.env.PUBLIC_DATA_URL) throw new Error("PUBLIC_DATA_URL is not set: the deployment would have no data");
	// Previews read production's data and upload nothing; only production writes the bucket.
	if (process.env.VERCEL_ENV === "production") {
		if (!r2) throw new Error(NO_KEYS);
		await upload(r2);
	}
	const keys = localKeys();
	keys.forEach((k) => fs.rmSync(path.join(PUBLIC, k)));
	console.log(`data-sync: ${keys.length} data files left out of the deployment`);
}
