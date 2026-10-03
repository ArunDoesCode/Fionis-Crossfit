// Hand-written helper types. Request/response shapes come from `api.generated.ts`
// (`bun run types:api`) — never redefine them here.
export interface ErrorBody {
  message?: string;
  code?: string;
}
