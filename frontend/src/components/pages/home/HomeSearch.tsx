'use client';

import SearchField from '@/components/common/SearchField';
import { UI_TEXT } from '@/lib/messages/words';

const noop = () => {};

// SLOT owned by members (Stream B): the Home search (tap budget "Home search → 2 letters → tap result",
// BR-REC-140): 250 ms debounce, 2-letter minimum, results as rows under the field. Replace this whole file.
// Placeholder: the field's look only; typing does nothing and there are no data calls.
export default function HomeSearch() {
  return <SearchField label={UI_TEXT.searchMembers} value="" onChange={noop} />;
}
