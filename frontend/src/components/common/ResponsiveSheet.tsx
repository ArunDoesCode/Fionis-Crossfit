'use client';

import { Drawer } from '@base-ui/react/drawer';
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
  children?: React.ReactNode;
}

const FOOTER =
  'mt-6 flex flex-col-reverse gap-2 *:h-(--control-height) lg:flex-row lg:justify-end lg:*:w-auto';

// BR-REC-138: short choices open as a bottom sheet on phones (swipe down or Back closes it) and as a
// centred dialog from 1024 px. Same props either way. Both are loaded with the screen that uses them.
export default function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  footer,
  alert = false,
  children,
}: ResponsiveSheetProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useBackToClose(open, close);

  if (isDesktop) {
    const body = (
      <>
        {children}
        {footer && <div className={FOOTER}>{footer}</div>}
      </>
    );
    return alert ? (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
          </AlertDialogHeader>
          {body}
        </AlertDialogContent>
      </AlertDialog>
    ) : (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false}>
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
    <Drawer.Root open={open} onOpenChange={onOpenChange} disablePointerDismissal={alert}>
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-black/60 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 supports-[-webkit-touch-callout:none]:absolute" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
          <Drawer.Popup
            data-slot="responsive-sheet"
            {...(alert ? { role: 'alertdialog' as const } : {})}
            className="-mb-12 max-h-[calc(85dvh+3rem)] w-full touch-auto overflow-y-auto overscroll-contain rounded-t-3xl border-t bg-popover px-6 pt-3 pb-[calc(1.5rem+3rem+env(safe-area-inset-bottom,0px))] text-popover-foreground shadow-lg outline-none transition-transform duration-150 ease-out [transform:translateY(var(--drawer-swipe-movement-y))] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*150ms)] data-ending-style:[transform:translateY(calc(100%-3rem+2px))] data-starting-style:[transform:translateY(calc(100%-3rem+2px))] data-swiping:select-none"
          >
            <div
              aria-hidden="true"
              className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted-foreground/40"
            />
            <Drawer.Content className="mx-auto w-full max-w-[32rem]">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Drawer.Title className="font-heading text-lg font-semibold">
                    {title}
                  </Drawer.Title>
                  {description && (
                    <Drawer.Description className="mt-1 text-sm text-muted-foreground">
                      {description}
                    </Drawer.Description>
                  )}
                </div>
                <Drawer.Close
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={UI_TEXT.close}
                      className="-mt-1 -mr-2 size-(--control-height) shrink-0"
                    />
                  }
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-5" />
                </Drawer.Close>
              </div>
              <div className="mt-4">{children}</div>
              {footer && <div className={FOOTER}>{footer}</div>}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
