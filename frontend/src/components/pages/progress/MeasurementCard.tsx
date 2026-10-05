import Sparkline from '@/components/pages/progress/Sparkline';
import { Card, CardContent } from '@/components/ui/card';
import type { ReportMetric } from '@/lib/api/progress/fetchers';
import {
  changeText,
  firstReadingText,
  PROGRESS_TEXT,
  readingDateText,
  valueText,
} from '@/lib/progress/text';

const text = PROGRESS_TEXT.report;

interface MeasurementCardProps {
  metric: ReportMetric;
  today: string;
}

// S12 on screen, phone and desktop alike (BR-REC-135, 106, 229): one card per measurement. Latest value and
// date, "first … · best …", the change line and the trend of the last 12 readings. With one reading the
// card says "First reading · 81.7 kg" (BR-REC-22, 229), never dashes. Hidden on paper, where
// `MeasurementTable` shows the same rows.
export default function MeasurementCard({ metric, today }: MeasurementCardProps) {
  const bare = { ...metric, unit: '' }; // the unit is already on the latest value
  const single = metric.readings < 2;
  const change = changeText(metric.change, metric);
  const points = metric.points.map((point) => point.value);

  return (
    <li>
      <Card size="sm" className="h-full">
        <CardContent className="flex flex-col gap-1">
          {single ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="min-w-0 text-base font-medium">{metric.name}</h3>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {readingDateText(metric.latest.on, metric.latest.isEstimated, today)}
                </span>
              </div>
              <p className="tabular-nums text-lg font-semibold">
                {firstReadingText(metric.latest.value, metric)}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="min-w-0 text-base font-medium">{metric.name}</h3>
                <p className="shrink-0 text-right">
                  <span className="tabular-nums text-lg font-semibold">
                    {valueText(metric.latest.value, metric)}
                  </span>
                  <span className="ml-2 text-sm text-muted-foreground">
                    {readingDateText(metric.latest.on, metric.latest.isEstimated, today)}
                  </span>
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {`${text.firstShort} `}
                <span className="tabular-nums">{valueText(metric.first.value, bare)}</span>
                {` (${readingDateText(metric.first.on, metric.first.isEstimated, today)})`}
                {metric.best && (
                  <>
                    {` · ${text.bestShort} `}
                    <span className="tabular-nums">{valueText(metric.best.value, bare)}</span>
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
        </CardContent>
      </Card>
    </li>
  );
}
