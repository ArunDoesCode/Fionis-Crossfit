import type { IsoDate } from '@/lib/domain/dates';
import type { operations } from '@/types/api.generated';

// Shapes come from the generated contract (never redefined by hand): E31 rows, E32 lines, E33 body.
type Json<T> = T extends { content: { 'application/json': infer B } } ? B : never;
type Reply<Name extends keyof operations, Status extends number> = operations[Name] extends {
  responses: Record<Status, infer R>;
}
  ? Json<R>
  : never;

/** E31 answer: the rows and `meta` (`meta.total` is the count shown in a Home section's title). */
export type DueListPage = Reply<'getApiDue', 200>;
/** E31 `data[]`: one member + one assessment on the Overdue / Due soon lists. */
export type DueListItem = DueListPage['data'][number];
/** One measurement that is due (a chip). */
export type DueItem = DueListItem['items'][number];
/** E31 `status`: the API says "upcoming" where the screen and the URL say "soon". */
export type DueListStatus = operations['getApiDue']['parameters']['query']['status'];
/** E32 `data[]`: one assessment on the member page. */
export type MemberDueItem = Reply<'getApiMembersMemberIdDue', 200>['data'][number];

/** E33 body: `{ action: 'flag' }` (Assess soon) or `{ action: 'snooze', until }` (Remind me later). */
export type DueActionBody = NonNullable<
  operations['putApiMembersMemberIdDue-actionsTypeId']['requestBody']
>['content']['application/json'];
/** E33 `data`. */
export type DueActionResult = Reply<'putApiMembersMemberIdDue-actionsTypeId', 200>['data'];

/** The two tabs of S3 and the two Home sections (`soon` is `upcoming` for the API). */
export type DueTab = 'overdue' | 'soon';

/**
 * A change the lists show at once (perf tactic 8): `flag` = Assess soon, `snooze` = Remind me later (with
 * `until`), `clear` = remove either.
 */
export interface DueChange {
  memberId: string;
  typeId: string;
  action: 'flag' | 'snooze' | 'clear';
  until?: IsoDate;
}
