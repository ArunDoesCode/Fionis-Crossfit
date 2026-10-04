import { api } from '@/lib/api/client';
import { API_ROUTES, apiPath } from '@/lib/api/routes';
import type {
  AssessmentDetail,
  AssessmentListPage,
  AssessmentListQuery,
  DeleteAssessmentResult,
  EntryForm,
  MemberDueRow,
  SaveAssessmentBody,
  SaveAssessmentResult,
  UpdateAssessmentBody,
} from '@/lib/assessments/types';

// E25–E30 (api-contract.md, assessments.md). Success is `{ success: true, data }`; the fetchers hand back `data` (the list keeps
// `meta`). Failures throw ApiError with the server's code. Types come from the generated contract.

/**
 * E25: the measurements of one assessment for one date, each with its previous value, and the saved
 * assessment of that date when there is one (BR-REC-20, 74, 81). `signal` is the query's own.
 */
export async function getEntryForm(
  memberId: string,
  typeId: string,
  date: string,
  signal?: AbortSignal,
): Promise<EntryForm> {
  const res = await api.get<{ data: EntryForm }>(
    apiPath(API_ROUTES.MEMBERS.ENTRY_FORM, { memberId }),
    { query: { typeId, date }, signal },
  );
  return res.data;
}

/**
 * E26: save the results of one member + assessment + date. Saving again edits the same assessment, so a
 * retry after a lost answer never makes a second one (BR-REC-86): no idempotency key is needed.
 */
export async function saveAssessment(body: SaveAssessmentBody): Promise<SaveAssessmentResult> {
  const res = await api.post<{ data: SaveAssessmentResult }, SaveAssessmentBody>(
    API_ROUTES.ASSESSMENTS.SAVE,
    body,
  );
  return res.data;
}

/** E27: one page of a member's assessments, newest first (`typeId` filters, BR-REC-89). */
export async function listAssessments(
  query: AssessmentListQuery,
  signal?: AbortSignal,
): Promise<AssessmentListPage> {
  return api.get<AssessmentListPage>(API_ROUTES.ASSESSMENTS.LIST, { query, signal });
}

/** E28: one assessment with every stored value. */
export async function getAssessment(assessmentId: string): Promise<AssessmentDetail> {
  const res = await api.get<{ data: AssessmentDetail }>(
    apiPath(API_ROUTES.ASSESSMENTS.DETAIL, { assessmentId }),
  );
  return res.data;
}

/** E29: move the date and/or change About; only the fields sent change. 409 when the date is taken. */
export async function updateAssessment(
  assessmentId: string,
  body: UpdateAssessmentBody,
): Promise<AssessmentDetail> {
  const res = await api.patch<{ data: AssessmentDetail }, UpdateAssessmentBody>(
    apiPath(API_ROUTES.ASSESSMENTS.DETAIL, { assessmentId }),
    body,
  );
  return res.data;
}

/** E30: delete the assessment and its values (BR-REC-88). */
export async function deleteAssessment(assessmentId: string): Promise<DeleteAssessmentResult> {
  const res = await api.delete<{ data: DeleteAssessmentResult }>(
    apiPath(API_ROUTES.ASSESSMENTS.DETAIL, { assessmentId }),
  );
  return res.data;
}

/**
 * E32 (due-list stream's endpoint, read only here): the status of each of the member's assessments, for the
 * words in the choose sheet and the "due" tags on the form (BR-REC-73). It may still answer 501: the
 * caller shows no status then (D11).
 */
export async function getMemberDue(
  memberId: string,
  signal?: AbortSignal,
): Promise<MemberDueRow[]> {
  const res = await api.get<{ data: MemberDueRow[] }>(
    apiPath(API_ROUTES.MEMBERS.DUE, { memberId }),
    { signal },
  );
  return res.data;
}
