'use client';

import ListRow, { RowList } from '@/components/common/ListRow';
import StatusBadge from '@/components/common/StatusBadge';
import MoveButtons from '@/components/pages/setup/MoveButtons';
import type { Metric } from '@/lib/api/setup/fetchers';
import { measurementDetail, repeatLine } from '@/lib/setup/describe';
import { SETUP_TEXT } from '@/lib/setup/text';

interface MeasurementListProps {
  measurements: readonly Metric[];
  onOpen: (measurement: Metric) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
}

// S15 detail rows (BR-REC-10, 14, 66, 67): name, "unit · Higher is better", an own repeat on its own line,
// an Off badge, Move up / Move down. Tapping the row opens the measurement sheet.
export default function MeasurementList({ measurements, onOpen, onMove }: MeasurementListProps) {
  return (
    <RowList>
      {measurements.map((measurement, index) => (
        <ListRow
          key={measurement.id}
          title={measurement.name}
          detail={measurementDetail(measurement)}
          onClick={() => onOpen(measurement)}
          status={
            measurement.isActive ? undefined : (
              <StatusBadge tone="neutral">{SETUP_TEXT.assessments.off}</StatusBadge>
            )
          }
          trailing={
            <MoveButtons
              name={measurement.name}
              canMoveUp={index > 0}
              canMoveDown={index < measurements.length - 1}
              onMove={(direction) => onMove(index, direction)}
            />
          }
        >
          {measurement.intervalCount !== null && measurement.intervalUnit !== null && (
            <span className="text-sm text-muted-foreground">
              {repeatLine(measurement.intervalCount, measurement.intervalUnit)}
            </span>
          )}
        </ListRow>
      ))}
    </RowList>
  );
}
