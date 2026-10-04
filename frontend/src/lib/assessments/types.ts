import type { operations } from '@/types/api.generated';

// Shapes of E25–E30 taken from the generated contract (never typed by hand). Pure modules and the
// screens import them from here; the fetchers use the same names.
type Json<T> = T extends { content: { 'application/json': infer B } } ? B : never;
type Reply<Name extends keyof operations, Status extends number> = operations[Name] extends {
  responses: Record<Status, infer R>;
}
  ? Json<R>
  : never;
type RequestBody<Name extends keyof operations> = operations[Name] extends {
  requestBody: infer B;
}
  ? Json<B>
  : never;

/** E25: member, assessment, the saved assessment of that date (or null) and the measurements to fill. */
export type EntryForm = Reply<'getApiMembersMemberIdEntry-form', 200>['data'];
export type EntryMetric = EntryForm['metrics'][number];
export type ExistingAssessment = NonNullable<EntryForm['existing']>;
/** E26 */
export type SaveAssessmentBody = RequestBody<'postApiAssessments'>;
export type SaveAssessmentResult = Reply<'postApiAssessments', 200>['data'];
/** E27 */
export type AssessmentListPage = Reply<'getApiAssessments', 200>;
export type AssessmentListItem = AssessmentListPage['data'][number];
export type AssessmentListQuery = operations['getApiAssessments']['parameters']['query'];
/** E28 / E29 */
export type AssessmentDetail = Reply<'getApiAssessmentsAssessmentId', 200>['data'];
export type UpdateAssessmentBody = RequestBody<'patchApiAssessmentsAssessmentId'>;
/** E30 */
export type DeleteAssessmentResult = Reply<'deleteApiAssessmentsAssessmentId', 200>['data'];
/** E32 (read only here, for the status words of the choose sheet and the "due" tags). */
export type MemberDueRow = Reply<'getApiMembersMemberIdDue', 200>['data'][number];

/** Decimals of a Number measurement (setup C: 0, 1 or 2). */
export type Decimals = 0 | 1 | 2;
export const asDecimals = (decimals: number): Decimals =>
  decimals === 0 ? 0 : decimals === 2 ? 2 : 1;

/** What a field holds on screen: typed text (Number), seconds or null (Time). Same shape the draft keeps. */
export type FieldInput = string | number | null;
/** The fields of one form by measurement id. */
export type Inputs = Record<string, FieldInput>;
