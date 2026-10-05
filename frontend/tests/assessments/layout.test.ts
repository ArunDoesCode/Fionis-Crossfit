// Spec: docs/specs/member-records/assessments.md — BR-REC-216 + "Build clarifications (U4)"; ux.md BR-REC-188.
// Interface: `@/lib/assessments/layout`: `layoutMetrics(metrics)` -> `{ title: string | null, metrics }[]`.
//   Input metrics are in setup order (array order). tablePart enum order (backend/src/lib/enums.ts TABLE_PARTS):
//   whole_body, arms, trunk, legs.
import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Part = 'whole_body' | 'arms' | 'trunk' | 'legs';
interface M {
  id: string;
  tableGroup: string | null;
  tablePart: Part | null;
}
interface Block {
  title: string | null;
  metrics: M[];
}
interface Layout {
  layoutMetrics(metrics: M[]): Block[];
}

let layout: Layout;
beforeAll(async () => {
  layout = (await import('@/lib/assessments/layout')) as unknown as Layout;
});

const plain = (id: string): M => ({ id, tableGroup: null, tablePart: null });
const grp = (id: string, tableGroup: string, tablePart: Part): M => ({ id, tableGroup, tablePart });
const at = (blocks: Block[], i: number): Block => {
  const b = blocks[i];
  if (!b) throw new Error(`no block at ${i}`);
  return b;
};
const ids = (b: Block) => b.metrics.map((m) => m.id);

describe('layoutMetrics (BR-REC-216)', () => {
  test('BR-REC-216 empty input gives no blocks', () => {
    expect(layout.layoutMetrics([])).toEqual([]);
  });

  test('BR-REC-216 metrics without a group form one untitled block in setup order', () => {
    const out = layout.layoutMetrics([plain('c'), plain('a'), plain('b')]);
    expect(out).toHaveLength(1);
    expect(at(out, 0).title).toBeNull();
    expect(ids(at(out, 0))).toEqual(['c', 'a', 'b']);
  });

  test('BR-REC-216 a group becomes one titled block named after the group', () => {
    const out = layout.layoutMetrics([grp('x', 'Skeletal muscle %', 'arms')]);
    expect(out).toHaveLength(1);
    expect(at(out, 0).title).toBe('Skeletal muscle %');
  });

  test('BR-REC-216 parts are ordered whole body, arms, trunk, legs', () => {
    const out = layout.layoutMetrics([
      grp('legs', 'G', 'legs'),
      grp('trunk', 'G', 'trunk'),
      grp('arms', 'G', 'arms'),
      grp('whole', 'G', 'whole_body'),
    ]);
    expect(ids(at(out, 0))).toEqual(['whole', 'arms', 'trunk', 'legs']);
  });

  test('BR-REC-216 members of a group are gathered even when not adjacent in setup order', () => {
    const out = layout.layoutMetrics([
      grp('g1', 'G', 'arms'),
      plain('p'),
      grp('g2', 'G', 'whole_body'),
    ]);
    expect(out.map((b) => b.title)).toEqual(['G', null]);
    expect(ids(at(out, 0))).toEqual(['g2', 'g1']);
    expect(ids(at(out, 1))).toEqual(['p']);
  });

  test('BR-REC-216 a block keeps the position of its first metric in setup order', () => {
    const out = layout.layoutMetrics([
      plain('a'),
      grp('s-arms', 'Skeletal', 'arms'),
      plain('b'),
      grp('s-whole', 'Skeletal', 'whole_body'),
      plain('c'),
    ]);
    // the untitled block (first metric 'a', position 0) comes first, holding all plain metrics in setup order
    expect(out.map((b) => b.title)).toEqual([null, 'Skeletal']);
    expect(ids(at(out, 0))).toEqual(['a', 'b', 'c']);
    expect(ids(at(out, 1))).toEqual(['s-whole', 's-arms']);
  });

  test('BR-REC-216 two groups keep the order of their first metric', () => {
    const out = layout.layoutMetrics([
      grp('b1', 'B', 'arms'),
      grp('a1', 'A', 'arms'),
      grp('b2', 'B', 'legs'),
    ]);
    expect(out.map((b) => b.title)).toEqual(['B', 'A']);
  });

  test('BR-REC-216 Body composition seed: 7 plain + 2 groups x 4 parts', () => {
    const parts: Part[] = ['whole_body', 'arms', 'trunk', 'legs'];
    const input: M[] = [
      ...['weight', 'bmi', 'bodyFat', 'visceral', 'bmr', 'water', 'bone'].map(plain),
      ...parts.map((p) => grp(`sub-${p}`, 'Subcutaneous fat %', p)),
      ...parts.map((p) => grp(`mus-${p}`, 'Skeletal muscle %', p)),
    ];
    // shuffle part order within groups to prove ordering is by part, not input
    const pick = (i: number): M => {
      const m = input[i];
      if (!m) throw new Error('bad index');
      return m;
    };
    const shuffled = [
      ...input.slice(0, 7),
      pick(10),
      pick(8),
      pick(9),
      pick(11),
      pick(14),
      pick(12),
      pick(13),
      pick(7),
    ];
    const out = layout.layoutMetrics(shuffled);
    expect(out).toHaveLength(3);
    expect(at(out, 0).title).toBeNull();
    expect(at(out, 0).metrics).toHaveLength(7);
    expect(at(out, 1).title).toBe('Subcutaneous fat %');
    expect(ids(at(out, 1))).toEqual(['sub-whole_body', 'sub-arms', 'sub-trunk', 'sub-legs']);
    expect(at(out, 2).title).toBe('Skeletal muscle %');
    expect(ids(at(out, 2))).toEqual(['mus-whole_body', 'mus-arms', 'mus-trunk', 'mus-legs']);
  });

  test('BR-REC-216 Fitness test (no groups): one untitled block with every metric', () => {
    const input = ['a', 'b', 'c', 'd', 'e'].map(plain);
    const out = layout.layoutMetrics(input);
    expect(out).toHaveLength(1);
    expect(at(out, 0).title).toBeNull();
    expect(ids(at(out, 0))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('Record assessment form source (BR-REC-216, BR-REC-188)', () => {
  const dir = join(import.meta.dir, '../../src/components/pages/assessments');
  const read = (f: string) => readFileSync(join(dir, f), 'utf8');
  const all = () =>
    ['EntryScreen.tsx', 'EntryFields.tsx', 'EntryDateSection.tsx'].map(read).join('\n');

  // ux.md v10 BR-REC-230 (amends BR-REC-216): "1 column on phones, 2 from 768 px, 3 from 1280 px".
  test('BR-REC-230 (amends BR-REC-216) the form screen uses FormGrid with maxCols 3', () => {
    expect(all()).toMatch(/<FormGrid[^>]*maxCols=\{3\}/);
    expect(all()).not.toMatch(/<FormGrid[^>]*maxCols=\{2\}/);
    expect(all()).not.toMatch(/<FormGrid[^>]*maxCols=\{4\}/);
  });

  test('BR-REC-216 titled blocks use FormSection and layoutMetrics', () => {
    const src = all();
    expect(src).toContain('FormSection');
    expect(src).toContain('layoutMetrics');
  });

  test('BR-REC-216 the screen keeps a real <form> with an onSubmit (Enter saves)', () => {
    expect(read('EntryScreen.tsx')).toMatch(/<form[^>]*onSubmit=/);
  });
});
