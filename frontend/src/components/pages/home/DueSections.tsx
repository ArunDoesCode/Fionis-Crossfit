'use client';

import DueSection from '@/components/pages/due/DueSection';
import DueSheet from '@/components/pages/due/DueSheetLazy';
import { useDueSheet } from '@/lib/due/useDueSheet';

// SLOT owned by due-list (Stream E): "Overdue" then "Due soon", each with its count, the first 5 rows and
// "See all" (BR-REC-101). A row tap opens Record assessment (1 tap, BR-REC-140); the row's "⋯" opens the one
// sheet both sections share. The frame (HomeView) only places this.
export default function DueSections() {
  const sheet = useDueSheet();

  return (
    <>
      <DueSection tab="overdue" onMore={sheet.show} />
      <DueSection tab="soon" onMore={sheet.show} />
      <DueSheet
        target={sheet.target}
        session={sheet.session}
        open={sheet.open}
        onOpenChange={sheet.onOpenChange}
      />
    </>
  );
}
