'use client';

import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useCallback } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer';
import { useBackToClose } from '@/lib/hooks/useBackToClose';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { UI_TEXT } from '@/lib/messages/words';

export interface ResponsiveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Always set: it is the sheet's spoken name. */
  title: string;
  description?: string;
  /**
   * Buttons row, listed Cancel first. Desktop: a row, right-aligned. Phone: full-width 48 px buttons
   * stacked with the last one (the action) on top.
   */
  footer?: React.ReactNode;
  /**
   * Confirmation style (ConfirmSheet): role "alertdialog", closes only by its own buttons, Back or
   * swipe-down, not by tapping outside.
   */
  alert?: boolean;
  /** Phone/desktop Back closes the sheet (BR-REC-138). Off only when the caller already owns the history. */
  backToClose?: boolean;
  /** Extra classes for the desktop dialog only (e.g. `sm:max-w-2xl` for a two-column form). */
  desktopClassName?: string;
  children?: React.ReactNode;
}

const FOOTER =
  'flex flex-col-reverse gap-2 *:h-(--control-height) lg:flex-row lg:justify-end lg:*:w-auto';

// Desktop: header, body and footer are grid rows; only the body scrolls, so the buttons stay in view (#18).
const DESKTOP_POPUP = 'max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto]';

// BR-REC-138: short choices open as a bottom sheet on phones (swipe down or Back closes it) and as a
// centred dialog from 1024 px. Same props either way. Both are loaded with the screen that uses them.
export default function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  footer,
  alert = false,
  backToClose = true,
  desktopClassName,
  children,
}: ResponsiveSheetProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useBackToClose(open && backToClose, close);

  if (isDesktop) {
    const body = (
      <>
        <div className="min-h-0 overflow-y-auto">{children}</div>
        {footer && <div className={FOOTER}>{footer}</div>}
      </>
    );
    return alert ? (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent className={DESKTOP_POPUP}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
          </AlertDialogHeader>
          {body}
        </AlertDialogContent>
      </AlertDialog>
    ) : (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className={desktopClassName ? `${DESKTOP_POPUP} ${desktopClassName}` : DESKTOP_POPUP}
        >
          <DialogHeader>
            <DialogTitle className="pr-12 text-lg">{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {body}
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={UI_TEXT.close}
                className="absolute top-3 right-3 size-(--control-height)"
              />
            }
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-5" />
          </DialogClose>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} disablePointerDismissal={alert} showSwipeHandle>
      <DrawerContent
        data-slot="responsive-sheet"
        {...(alert ? { role: 'alertdialog' as const } : {})}
        className="m-0 rounded-t-3xl rounded-b-none"
      >
        <div className="flex items-start gap-2 px-6 pt-2">
          <div className="min-w-0 flex-1">
            <DrawerTitle className="text-lg font-semibold">{title}</DrawerTitle>
            {description && <DrawerDescription className="mt-1">{description}</DrawerDescription>}
          </div>
          <DrawerClose
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={UI_TEXT.close}
                className="-mr-2 size-(--control-height) shrink-0"
              />
            }
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-5" />
          </DrawerClose>
        </div>
        <div className="mx-auto min-h-0 w-full max-w-[32rem] flex-1 overflow-y-auto px-6 pt-4">
          {children}
        </div>
        {footer && (
          <div
            className={`${FOOTER} mx-auto w-full max-w-[32rem] px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]`}
          >
            {footer}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
