import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readResumeNdjson } from '../scripts/scoutCodec';

const tmp = (name: string) => path.join(os.tmpdir(), `scout-resume-test-${process.pid}-${name}.ndjson`);

describe('readResumeNdjson — tolerant resume-file parse (crash-resume)', () => {
	it('missing file → empty done-set and no cells', () => {
		const r = readResumeNdjson(tmp('missing'));
		expect(r.done.size).toBe(0);
		expect(r.cells).toEqual([]);
	});

	it('collects completed indices + their cells, in any order', () => {
		const f = tmp('good');
		fs.writeFileSync(f, [
			JSON.stringify({ idx: 0, cells: [{ tag: 'a' }] }),
			JSON.stringify({ idx: 5, cells: [{ tag: 'b' }, { tag: 'c' }] }),
			JSON.stringify({ idx: 2, cells: [] }), // a seed that produced no cells is still DONE
		].join('\n') + '\n');
		const r = readResumeNdjson(f);
		fs.unlinkSync(f);
		expect([...r.done].sort((a, b) => a - b)).toEqual([0, 2, 5]);
		expect(r.cells).toHaveLength(3); // a + b + c
	});

	it('tolerates a TRUNCATED final line (process killed mid-write) — keeps the valid prefix', () => {
		const f = tmp('truncated');
		fs.writeFileSync(f,
			JSON.stringify({ idx: 0, cells: [{ tag: 'a' }] }) + '\n' +
			JSON.stringify({ idx: 1, cells: [{ tag: 'b' }] }) + '\n' +
			'{"idx":2,"cells":[{"tag":"part' // truncated, no closing — must be skipped, not throw
		);
		const r = readResumeNdjson(f);
		fs.unlinkSync(f);
		expect([...r.done].sort((a, b) => a - b)).toEqual([0, 1]);
		expect(r.cells).toHaveLength(2);
	});
});
