import MeasurementCard from '@/components/pages/progress/MeasurementCard';
import MeasurementTable from '@/components/pages/progress/MeasurementTable';
import type { ReportType } from '@/lib/api/progress/fetchers';

interface ReportSectionProps {
  type: ReportType;
  today: string;
}

// One assessment of the report card, in setup order (BR-REC-106): cards on a phone, the table on desktop
// and paper. Never-recorded measurements are already left out by the API.
export default function ReportSection({ type, today }: ReportSectionProps) {
  return (
    <section aria-label={type.name} className="flex flex-col gap-3 print:gap-1">
      <h2 className="font-heading text-lg font-semibold print:text-[11pt]">{type.name}</h2>
      <ul className="flex flex-col gap-3 lg:hidden print:hidden">
        {type.metrics.map((metric) => (
          <MeasurementCard key={metric.id} metric={metric} today={today} />
        ))}
      </ul>
      <MeasurementTable type={type} today={today} />
    </section>
  );
}
