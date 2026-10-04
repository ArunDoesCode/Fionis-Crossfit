import type { Segmental } from '@/lib/api/progress/fetchers';
import { PROGRESS_TEXT, readingDateText, valueText } from '@/lib/progress/text';

const text = PROGRESS_TEXT.report;

interface SegmentalSectionProps {
  segmental: Segmental;
  today: string;
}

type Group = Segmental['groups'][number];

// The column title: the group's name, with its unit in brackets unless the name already says it.
const groupTitle = (group: Group): string =>
  group.unit !== '' && !group.name.includes(group.unit)
    ? `${group.name} (${group.unit})`
    : group.name;

// BR-REC-108, P3: one cell, "–" when the value is missing.
const cellText = (value: number | null | undefined, group: Group): string =>
  value === null || value === undefined
    ? text.noValue
    : valueText(value, { datatype: 'number', decimals: group.decimals, unit: '', better: 'none' });

// The segmental analysis of the latest body scan (BR-REC-22, 108): rows = Whole body, Arms, Trunk, Legs,
// one column per group, with the scan's date (≈ when estimated). A table on desktop and on paper; on a
// phone one card per group with the four parts as lines, so nothing scrolls sideways (BR-REC-135, 139).
export default function SegmentalSection({ segmental, today }: SegmentalSectionProps) {
  const title = `${text.segmental} · ${readingDateText(segmental.on, segmental.isEstimated, today)}`;
  return (
    <section aria-label={title} className="flex flex-col gap-3 print:gap-1">
      <h2 className="font-heading text-lg font-semibold print:text-[11pt]">{title}</h2>

      <ul className="flex flex-col gap-3 lg:hidden print:hidden">
        {segmental.groups.map((group) => (
          <li key={group.name} className="rounded-2xl border bg-card p-4">
            <h3 className="text-base font-medium">{groupTitle(group)}</h3>
            <dl className="mt-2 flex flex-col gap-1">
              {segmental.rows.map((row) => (
                <div key={row.part} className="flex items-baseline justify-between gap-3">
                  <dt className="text-sm text-muted-foreground">{text.parts[row.part]}</dt>
                  <dd className="font-mono">{cellText(row.values[group.name], group)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      <table className="hidden w-full border-collapse text-sm lg:table print:table print:text-[9pt] print:leading-tight">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th scope="col" className="py-2 pr-2 font-medium print:py-[0.4mm]">
              {text.bodyPart}
            </th>
            {segmental.groups.map((group) => (
              <th
                key={group.name}
                scope="col"
                className="py-2 pr-2 text-right font-medium whitespace-normal print:py-[0.4mm]"
              >
                {groupTitle(group)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {segmental.rows.map((row) => (
            <tr key={row.part} className="break-inside-avoid border-b">
              <th scope="row" className="py-2 pr-2 text-left font-normal print:py-[0.4mm]">
                {text.parts[row.part]}
              </th>
              {segmental.groups.map((group) => (
                <td
                  key={group.name}
                  className="py-2 pr-2 text-right font-mono tabular-nums print:py-[0.4mm]"
                >
                  {cellText(row.values[group.name], group)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
