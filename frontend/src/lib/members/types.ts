import type { Plan } from '@/lib/domain/membership';
import type { operations } from '@/types/api.generated';

// Shapes come from the generated contract (never redefined by hand). Fetchers and the pure helpers
// in this folder share them.
type Body<T> = T extends { content: { 'application/json': infer B } } ? B : never;
type Reply<Name extends keyof operations, Code extends number> = operations[Name] extends {
  responses: Record<Code, infer R>;
}
  ? Body<R>
  : never;

export type { Plan };
export type MembershipStatus = 'active' | 'expiring' | 'expired';
export type Sex = 'male' | 'female';
export type Objective = 'fat_loss' | 'strength' | 'general_fitness' | 'other';

/** E16 `data[]`: one row of the Members list and of the search results. */
export type MemberListItem = Reply<'getApiMembers', 200>['data'][number];
export type MemberListPage = Reply<'getApiMembers', 200>;
/** E18 `data`: the whole member (E17, E19, E20 and E21 answer with the same shape). */
export type MemberDetail = Reply<'getApiMembersMemberId', 200>['data'];
export type MemberPeriod = MemberDetail['periods'][number];

export type CreateMemberBody = NonNullable<
  operations['postApiMembers']['requestBody']
>['content']['application/json'];
export type UpdateMemberBody = NonNullable<
  operations['patchApiMembersMemberId']['requestBody']
>['content']['application/json'];

export type MemberListQuery = NonNullable<operations['getApiMembers']['parameters']['query']>;
export type MemberStatusFilter = NonNullable<MemberListQuery['status']>;
