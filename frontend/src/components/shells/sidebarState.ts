import { DESKTOP_QUERY } from '@/lib/breakpoints';

// Cookie that `ui/sidebar.tsx` writes on every toggle (BR-REC-177: the choice is remembered).
export const SIDEBAR_COOKIE = 'sidebar_state';

/** `<html data-sidebar="expanded|collapsed">`: set before first paint, kept in step by ShellProvider. */
export const SIDEBAR_ATTRIBUTE = 'data-sidebar';

// The server cannot read the cookie without making the whole shell dynamic, so this blocking script runs
// while the HTML is parsed, before the sidebar is painted. No saved choice (first visit): icons only
// below 1024 px (Q5).
export const SIDEBAR_STATE_SCRIPT = `(function(){try{var m=document.cookie.match(/${SIDEBAR_COOKIE}=(true|false)/);var open=m?m[1]==='true':window.matchMedia('${DESKTOP_QUERY}').matches;document.documentElement.setAttribute('${SIDEBAR_ATTRIBUTE}',open?'expanded':'collapsed')}catch(e){}})()`;

// Until React has applied the same state, the collapsed look comes from here (from 768 px; below that
// the sidebar is the drawer). Shadcn sizes the sidebar and its gap from `--sidebar-width`, set inline on
// the wrapper, hence `!important`.
const COLLAPSED = `html[${SIDEBAR_ATTRIBUTE}=collapsed]`;
export const SIDEBAR_STATE_CSS = `@media (min-width:768px){
${COLLAPSED} [data-slot=sidebar-wrapper]{--sidebar-width:var(--sidebar-width-icon)!important}
${COLLAPSED} [data-slot=sidebar-wordmark]{display:none}
${COLLAPSED} [data-slot=sidebar-mark]{display:flex}
${COLLAPSED} [data-slot=sidebar-menu-button]{width:2.75rem;height:2.75rem;padding:0.625rem}
${COLLAPSED} [data-slot=sidebar-content],${COLLAPSED} [data-slot=sidebar-footer]{padding-inline:0.125rem;align-items:center}
}`;

export const readSidebarOpen = () =>
  document.documentElement.getAttribute(SIDEBAR_ATTRIBUTE) !== 'collapsed';

export const writeSidebarOpen = (open: boolean) =>
  document.documentElement.setAttribute(SIDEBAR_ATTRIBUTE, open ? 'expanded' : 'collapsed');
