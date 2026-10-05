// Record assessment grid blocks (BR-REC-216): metrics without a group form one untitled block in setup order;
// a group is one titled block (whole body, arms, trunk, legs); blocks keep the position of their first metric.
const PART_ORDER = ['whole_body', 'arms', 'trunk', 'legs'];

interface Layoutable {
  tableGroup: string | null;
  tablePart: string | null;
}

export interface MetricBlock<T> {
  title: string | null;
  metrics: T[];
}

export function layoutMetrics<T extends Layoutable>(metrics: T[]): MetricBlock<T>[] {
  const blocks = new Map<string | null, MetricBlock<T>>();
  for (const metric of metrics) {
    const title = metric.tableGroup;
    const block = blocks.get(title) ?? { title, metrics: [] };
    block.metrics.push(metric);
    blocks.set(title, block);
  }
  const rank = (metric: T) => PART_ORDER.indexOf(metric.tablePart ?? '');
  return [...blocks.values()].map((block) =>
    block.title === null
      ? block
      : { ...block, metrics: [...block.metrics].sort((a, b) => rank(a) - rank(b)) },
  );
}
