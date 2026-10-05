import Sparkline from '@/components/pages/progress/Sparkline';
import type { ReportMetric } from '@/lib/api/progress/fetchers';
import { changeText, PROGRESS_TEXT, readingDateText, valueText } from '@/lib/progress/text';

const text = PROGRESS_TEXT.report;

interface MeasurementCardProps {
  metric: ReportMetric;
  today: string;
}

// S12 on a phone: one card per measurement (BR-REC-135, 106). Latest value and date, "first … · best …",
// the change line and the trend of the last 12 readings. Under two readings only the value and
// "(1 reading)" (BR-REC-22). Hidden on desktop and on paper, where `MeasurementTable` shows the same rows.
export default function MeasurementCard({ metric, today }: MeasurementCardProps) {
  const bare = { ...metric, unit: '' }; // the unit is already on the latest value
  const single = metric.readings < 2;
  const change = changeText(metric.change, metric);
  const points = metric.points.map((point) => point.value);

  return (
    <li className="flex flex-col gap-1 rounded-2xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 text-base font-medium">{metric.name}</h3>
        <p className="shrink-0 text-right">
          <span className="font-mono text-lg font-semibold">
            {valueText(metric.latest.value, metric)}
          </span>
          <span className="ml-2 text-sm text-muted-foreground">
            {single
              ? text.oneReading
              : readingDateText(metric.latest.on, metric.latest.isEstimated, today)}
          </span>
        </p>
      </div>
      {!single && (
        <>
          <p className="text-sm text-muted-foreground">
            {`${text.firstShort} `}
            <span className="font-mono">{valueText(metric.first.value, bare)}</span>
            {` (${readingDateText(metric.first.on, metric.first.isEstimated, today)})`}
            {metric.best && (
              <>
                {` · ${text.bestShort} `}
                <span className="font-mono">{valueText(metric.best.value, bare)}</span>
                {` (${readingDateText(metric.best.on, metric.best.isEstimated, today)})`}
              </>
            )}
          </p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-base">{change}</p>
            <Sparkline
              points={points}
              label={text.trendLabel(
                points.length,
                valueText(points[0] ?? 0, metric),
                valueText(points[points.length - 1] ?? 0, metric),
              )}
            />
          </div>
        </>
      )}
    </li>
  );
}
