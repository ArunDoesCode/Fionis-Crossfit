import Sparkline from '@/components/common/Sparkline';
import type { ReportMetric, ReportType } from '@/lib/api/progress/fetchers';
import { changeText, PROGRESS_TEXT, readingDateText, valueText } from '@/lib/progress/text';

const text = PROGRESS_TEXT.report;

interface MeasurementTableProps {
  type: ReportType;
  today: string;
}

type Reading = ReportMetric['first'];

// A reading: the number in the mono font so digits line up (BR-REC-123), its date small beside it.
function ReadingCell({
  reading,
  metric,
  today,
}: {
  reading: Reading;
  metric: ReportMetric;
  today: string;
}) {
  return (
    <>
      <span className="font-mono tabular-nums">
        {valueText(reading.value, { ...metric, unit: '' })}
      </span>{' '}
      <span className="text-xs text-muted-foreground print:text-[7pt]">
        {readingDateText(reading.on, reading.isEstimated, today)}
      </span>
    </>
  );
}

function MeasurementRow({ metric, today }: { metric: ReportMetric; today: string }) {
  const single = metric.readings < 2;
  const points = metric.points.map((point) => point.value);
  const showsUnit = metric.datatype === 'number' && metric.unit !== '';
  return (
    <tr className="break-inside-avoid border-b align-middle">
      <th
        scope="row"
        className="py-2 pr-2 text-left font-normal whitespace-normal print:py-[0.4mm]"
      >
        <span className="font-medium">{metric.name}</span>
        {showsUnit && <span className="ml-1 text-muted-foreground">{metric.unit}</span>}
        {single && <span className="ml-1 text-muted-foreground">{text.oneReading}</span>}
      </th>
      {single ? (
        <>
          <td className="py-2 pr-2 print:py-[0.4mm]">{text.noValue}</td>
          <td className="py-2 pr-2 print:py-[0.4mm]">
            <span className="font-mono tabular-nums">
              {valueText(metric.latest.value, { ...metric, unit: '' })}
            </span>
          </td>
          <td className="py-2 pr-2 print:py-[0.4mm]">{text.noValue}</td>
          <td className="py-2 pr-2 print:py-[0.4mm]">{text.noValue}</td>
          <td className="py-2 print:py-[0.4mm]">{text.noValue}</td>
        </>
      ) : (
        <>
          <td className="py-2 pr-2 print:py-[0.4mm]">
            <ReadingCell reading={metric.first} metric={metric} today={today} />
          </td>
          <td className="py-2 pr-2 print:py-[0.4mm]">
            <ReadingCell reading={metric.latest} metric={metric} today={today} />
          </td>
          <td className="py-2 pr-2 print:py-[0.4mm]">
            {metric.best ? (
              <ReadingCell reading={metric.best} metric={metric} today={today} />
            ) : (
              text.noValue
            )}
          </td>
          <td className="py-2 pr-2 whitespace-normal print:py-[0.4mm]">
            {changeText(metric.change, metric) ?? text.noValue}
          </td>
          <td className="py-2 print:py-[0.4mm]">
            <Sparkline
              points={points}
              width={64}
              height={18}
              label={text.trendLabel(
                points.length,
                valueText(points[0] ?? 0, metric),
                valueText(points[points.length - 1] ?? 0, metric),
              )}
            />
          </td>
        </>
      )}
    </tr>
  );
}

// S12 on desktop and on paper: First · Latest · Best · Change · Trend, one row per measurement (BR-REC-22,
// 106). Shown from 1024 px and in print (`print:` because paper is narrower than 1024 px); phones get cards.
export default function MeasurementTable({ type, today }: MeasurementTableProps) {
  return (
    <table className="hidden w-full table-fixed border-collapse text-sm lg:table print:table print:text-[9pt] print:leading-tight">
      <caption className="sr-only">{type.name}</caption>
      <colgroup>
        <col className="w-[21%]" />
        <col className="w-[16%]" />
        <col className="w-[16%]" />
        <col className="w-[16%]" />
        <col className="w-[20%]" />
        <col className="w-[11%]" />
      </colgroup>
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th scope="col" className="py-2 pr-2 font-medium print:py-[0.4mm]">
            {text.measurement}
          </th>
          <th scope="col" className="py-2 pr-2 font-medium print:py-[0.4mm]">
            {text.first}
          </th>
          <th scope="col" className="py-2 pr-2 font-medium print:py-[0.4mm]">
            {text.latest}
          </th>
          <th scope="col" className="py-2 pr-2 font-medium print:py-[0.4mm]">
            {text.best}
          </th>
          <th scope="col" className="py-2 pr-2 font-medium print:py-[0.4mm]">
            {text.change}
          </th>
          <th scope="col" className="py-2 font-medium print:py-[0.4mm]">
            {text.trend}
          </th>
        </tr>
      </thead>
      <tbody>
        {type.metrics.map((metric) => (
          <MeasurementRow key={metric.id} metric={metric} today={today} />
        ))}
      </tbody>
    </table>
  );
}
