import {
  createSearchParamsCache,
  createSerializer,
  parseAsInteger,
  parseAsString,
} from 'nuqs/server';

// Base list params (search + server pagination). Features spread these into their own parser object,
// e.g. `export const memberListParams = { ...listParams, status: parseAsStringLiteral(...) }`.
// Same object is used by the server cache (page.tsx) and the client hook (useQueryStates).
export const listParams = {
  q: parseAsString.withDefault(''),
  limit: parseAsInteger.withDefault(20),
  offset: parseAsInteger.withDefault(0),
};

export const listParamsCache = createSearchParamsCache(listParams);
export const serializeListParams = createSerializer(listParams);
