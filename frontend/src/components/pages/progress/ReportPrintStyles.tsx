// BR-REC-109: "Print" gives one A4 portrait page in black on white, without the shell. The shell files and
// globals.css stay as they are: these rules ship with the report card only (a `<style>` that exists while
// the screen is open and goes with it), and they find the shell through its own `data-slot` marks.
// The print width is about 700 px, so the `lg:` look never applies on paper: the table is shown with the
// `print:` variant (MeasurementTable), and the cards and the page header are hidden the same way.
// `color-scheme: light !important`: the theme puts an inline `color-scheme: dark` on `<html>`, which would
// otherwise paint the page margin dark when the browser prints background graphics.
const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
@media print {
  :root, :root.dark {
    color-scheme: light !important;
    --background: #fff;
    --foreground: #000;
    --card: #fff;
    --card-foreground: #000;
    --muted: #fff;
    --muted-foreground: #000;
    --border: #000;
    --page-padding: 0px;
    --section-gap: 3mm;
  }
  html, body { background: #fff; color: #000; }
  [data-slot="side-nav"],
  [data-slot="bottom-tab-bar"],
  [data-slot="action-bar"],
  [data-sonner-toaster],
  div:has(> [data-slot="app-main"]) > [role="status"] { display: none; }
  div:has(> div > [data-slot="app-main"]) { min-height: 0; }
  [data-slot="app-main"] { padding: 0; }
}
`;

export default function ReportPrintStyles() {
  return <style>{PRINT_CSS}</style>;
}
