import { cn } from '@/lib/utils';

interface SparklineProps {
  /** Values oldest to newest (the report card passes up to 12). */
  points: number[];
  /** Spoken description: "Trend of the last 6 readings, from 98.0 to 95.5". Required. */
  label: string;
  width?: number;
  height?: number;
  className?: string;
}

const PAD = 3;

// A tiny trend line drawn as plain SVG from the given points (no chart library, tactic 5). Takes the
// text colour; the last reading gets a dot. Fewer than 2 points draw just the dot.
export default function Sparkline({
  points,
  label,
  width = 96,
  height = 28,
  className,
}: SparklineProps) {
  if (points.length === 0) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;
  const innerW = width - PAD * 2;
  const innerH = height - PAD * 2;

  const coords = points.map((value, i) => {
    const x = points.length === 1 ? width / 2 : PAD + (innerW * i) / (points.length - 1);
    // A flat series sits in the middle; otherwise higher values are drawn higher.
    const y = span === 0 ? height / 2 : PAD + innerH * (1 - (value - min) / span);
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  });
  const last = coords[coords.length - 1];

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('shrink-0 text-muted-foreground', className)}
    >
      {coords.length > 1 && (
        <polyline
          points={coords.map((c) => `${c.x},${c.y}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {last && <circle cx={last.x} cy={last.y} r={3} fill="currentColor" />}
    </svg>
  );
}
