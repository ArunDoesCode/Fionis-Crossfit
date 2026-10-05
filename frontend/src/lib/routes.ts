import { DEFAULT_GYM_NAME, UI_TEXT } from '@/lib/messages/words';

const SCREENS = UI_TEXT.screens;

export interface RouteEntry {
  /** Next.js path with `[param]` segments. */
  pattern: string;
  title: string;
  /** The one screen "back" leads to. Top-level screens have none. */
  parent?: { label: string; pattern: string };
}

const HOME = { label: UI_TEXT.nav.home, pattern: '/admin' };
const MEMBERS = { label: SCREENS.members, pattern: '/admin/members' };
const MEMBER = { label: SCREENS.member, pattern: '/admin/members/[memberId]' };
const SETTINGS = { label: SCREENS.settings, pattern: '/admin/settings' };
const ASSESSMENT_SETUP = {
  label: SCREENS.assessmentSetup,
  pattern: '/admin/settings/assessments',
};

// BR-REC-179: the one table of screens, their titles and their parent. Breadcrumbs, the phone
// "‹ Parent" link, every loading.tsx and every screen read it through `routeFor`, so a back target
// never changes while a screen loads.
export const ROUTES: readonly RouteEntry[] = [
  { pattern: '/login', title: UI_TEXT.signIn },
  { pattern: '/admin', title: DEFAULT_GYM_NAME },
  { pattern: '/admin/due', title: SCREENS.dueList, parent: HOME },
  { pattern: '/admin/memberships', title: SCREENS.membershipsEnding },
  { pattern: '/admin/members', title: SCREENS.members },
  { pattern: '/admin/members/new', title: SCREENS.addMember, parent: MEMBERS },
  { pattern: '/admin/members/[memberId]', title: SCREENS.member, parent: MEMBERS },
  { pattern: '/admin/members/[memberId]/edit', title: SCREENS.editMember, parent: MEMBER },
  { pattern: '/admin/members/[memberId]/assess', title: SCREENS.recordAssessment, parent: MEMBER },
  {
    pattern: '/admin/members/[memberId]/assessments',
    title: SCREENS.allAssessments,
    parent: MEMBER,
  },
  { pattern: '/admin/members/[memberId]/report', title: SCREENS.reportCard, parent: MEMBER },
  { pattern: '/admin/reports', title: SCREENS.gymProgress },
  { pattern: '/admin/settings', title: SCREENS.settings },
  { pattern: '/admin/settings/assessments', title: SCREENS.assessmentSetup, parent: SETTINGS },
  {
    pattern: '/admin/settings/assessments/[typeId]',
    title: SCREENS.assessmentSetup,
    parent: ASSESSMENT_SETUP,
  },
  { pattern: '/admin/settings/general', title: SCREENS.remindersAndGym, parent: SETTINGS },
  { pattern: '/admin/settings/account', title: SCREENS.account, parent: SETTINGS },
  { pattern: '/admin/settings/export', title: SCREENS.exportData, parent: SETTINGS },
];

export interface ResolvedRoute {
  title: string;
  parent?: { label: string; href: string };
}

const segments = (path: string) => path.split('/').filter(Boolean);
const isParam = (segment: string) => segment.startsWith('[');

/** The `[param]` values when `pathname` fits `pattern`, else null. */
function match(pattern: string, pathname: string): Record<string, string> | null {
  const want = segments(pattern);
  const have = segments(pathname);
  if (want.length !== have.length) return null;
  const params: Record<string, string> = {};
  for (const [i, segment] of want.entries()) {
    if (isParam(segment)) params[segment] = have[i] as string;
    else if (segment !== have[i]) return null;
  }
  return params;
}

const fill = (pattern: string, params: Record<string, string>) =>
  pattern.replace(/\[[^\]]+\]/g, (name) => params[name] ?? name);

function resolve(entry: RouteEntry, params: Record<string, string>): ResolvedRoute {
  return {
    title: entry.title,
    parent: entry.parent && {
      label: entry.parent.label,
      href: fill(entry.parent.pattern, params),
    },
  };
}

/** Title and parent for a path (dynamic segments filled from the path); unknown paths give an empty title. */
export function routeFor(pathname: string): ResolvedRoute {
  // `/` is rewritten to Home, so the browser may report either.
  const path = pathname === '/' ? '/admin' : pathname;
  let best: { entry: RouteEntry; params: Record<string, string> } | null = null;
  for (const entry of ROUTES) {
    const params = match(entry.pattern, path);
    // A fixed path (`/members/new`) beats a `[param]` one that also fits.
    if (params && (!best || Object.keys(params).length < Object.keys(best.params).length)) {
      best = { entry, params };
    }
  }
  return best ? resolve(best.entry, best.params) : { title: '' };
}

/**
 * The same entry by its pattern, for a loading.tsx (it has no path or params at build time). A parent
 * that needs a param keeps its `[param]` href; `isResolved` tells it apart.
 */
export function routeForPattern(pattern: string): ResolvedRoute {
  const entry = ROUTES.find((r) => r.pattern === pattern);
  return entry ? resolve(entry, {}) : { title: '' };
}

/** True when a parent href has no `[param]` left in it. */
export const isResolved = (href: string) => !href.includes('[');

type Lookup = (key: string) => ResolvedRoute;

function trail(lookup: Lookup, key: string): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  for (let parent = lookup(key).parent; parent; parent = lookup(parent.href).parent) {
    out.unshift(parent);
  }
  return out;
}

/** Parents from the top down, for breadcrumbs ("Members / Member"). */
export const trailFor = (pathname: string) => trail(routeFor, pathname);

/** `trailFor` for a pattern: an unresolved parent's href is its own pattern, so the lookup still works. */
export const trailForPattern = (pattern: string) => trail(routeForPattern, pattern);
