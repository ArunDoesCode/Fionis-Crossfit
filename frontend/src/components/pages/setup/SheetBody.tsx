// The fields of an edit sheet. On phones the bottom sheet scrolls as a whole; the desktop dialog does not
// scroll or limit its height (shared ResponsiveSheet / dialog), so a tall form would run off a short
// screen with its title and Save out of reach. From 1024 px the fields scroll inside the dialog and the
// title and buttons stay in view. The side padding keeps focus rings from being clipped.
export default function SheetBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-2 px-2 py-1 lg:max-h-[calc(100dvh-16rem)] lg:overflow-y-auto">
      {children}
    </div>
  );
}
