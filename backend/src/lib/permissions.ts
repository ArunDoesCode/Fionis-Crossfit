/**
 * Permission catalog: keys are data, not enums scattered through route code.
 * Routes check keys through `requirePermission(key)`. The first deliverable
 * (member-records MVP) has one shared login and no roles, so the catalog is
 * empty; add keys here (`"<thing>.<action>"`) as modules are specced.
 */
export type PermissionDef = {
  label: string;
  description: string;
};

export const PERMISSIONS = {} as const satisfies Record<string, PermissionDef>;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];
