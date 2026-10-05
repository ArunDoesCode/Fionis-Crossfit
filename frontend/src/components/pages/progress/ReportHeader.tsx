import type { ReportCard } from '@/lib/api/progress/fetchers';
import { formatDay } from '@/lib/format';
import { SEX_LABELS } from '@/lib/members/labels';
import { PLAN_LABELS } from '@/lib/members/membershipText';
import { fullDayText, PROGRESS_TEXT } from '@/lib/progress/text';

const text = PROGRESS_TEXT.report;

interface ReportHeaderProps {
  card: ReportCard;
}

// The top of the card (BR-REC-106): name, age, sex, plan (status) and join date. From 1024 px and on paper
// the gym name and the printed date sit above it and the details run on one line.
export default function ReportHeader({ card }: ReportHeaderProps) {
  const { member } = card;
  const plan = `${PLAN_LABELS[member.plan]} (${text.status[member.membershipStatus]})`;
  const joined = `${text.joined} ${formatDay(member.joinedOn)}`;

  return (
    <header className="flex flex-col gap-1">
      <div className="hidden items-baseline justify-between gap-4 border-b pb-2 lg:flex print:flex">
        <p className="font-heading text-lg font-semibold print:text-[12pt]">{card.gymName}</p>
        <p className="text-sm text-muted-foreground">{`${text.printed} ${fullDayText(card.printedOn)}`}</p>
      </div>
      <h2 className="font-heading text-2xl font-semibold print:text-[14pt]">{member.fullName}</h2>
      <p className="text-base text-muted-foreground">
        <span className="block lg:inline print:inline">{`${member.age} ${text.age} · ${SEX_LABELS[member.sex]}`}</span>
        <span className="hidden lg:inline print:inline"> · </span>
        <span className="block lg:inline print:inline">{`${plan} · ${joined}`}</span>
      </p>
    </header>
  );
}
