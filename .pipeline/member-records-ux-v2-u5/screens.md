
## U5 frontend: member search + desktop tables
- `/admin` (Home), any member with Home access: search box now has a Name / Email / Phone picker (default Name); results appear from 2 characters, 25 rows then [Show more]; no match shows `No member matches "xyz".`; no spinner, nothing dims.
- `/admin/members` (members.view): same MemberSearch; text and field are in the address (`q`, `by`); chips filter the same list; no match shows the sentence plus [Add member]. From 1024 px the list is a table (Name, Phone, Status, Last assessment); whole row opens the member.
- `/admin/due` (due list): from 1024 px a table (Name, Assessment, Due status, "..." button); row opens Record assessment.
- `/admin/memberships` (both tabs): from 1024 px a table (Name, Phone, Status, Ends on, [Renew]); row opens the member.
- Member form phone field: duplicate-phone warning now reads the cached directory (no request on blur).
- Whole admin shell: loads the member directory once on open (one background request chain, 100 per page).
