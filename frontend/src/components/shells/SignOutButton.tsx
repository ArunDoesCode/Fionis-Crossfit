'use client';

import { Logout01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { useSignOut } from '@/lib/api/auth/queries';
import { UI_TEXT } from '@/lib/messages/words';

// Sidebar "Sign out" (BR-REC-177, 35): ends this device's sign-in (E03), clears the cache and opens Login.
// Off while the call runs, so a second tap cannot send it twice.
export default function SignOutButton() {
  const { mutate, isPending, isSuccess } = useSignOut();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          type="button"
          tooltip={UI_TEXT.signOut}
          className="h-(--control-height) [&_svg]:size-5 group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:p-2.5!"
          disabled={isPending || isSuccess}
          onClick={() => mutate()}
        >
          <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
          <span>{UI_TEXT.signOut}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
