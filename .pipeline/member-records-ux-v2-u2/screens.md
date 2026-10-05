
## Slice C: modals + native controls (frontend-dev)
- Every ResponsiveSheet/ConfirmSheet user (any admin permission that reaches them): phone sheet is now shadcn Drawer (swipe handle, close X, buttons pinned under a scrolling body); desktop dialog scrolls inside, buttons stay visible.
- Assessment leave guard (`/admin/members/:id/assessments/...` entry): "Leave without saving?" is now a ConfirmSheet with [Stay] / [Leave] (bottom sheet on phone, dialog on desktop). No Back-to-close.
- Settings > Gym (`GymSettingsForm`, setup permission): Time zone is a searchable picker (type "kolk" to find Asia/Kolkata), not a native select.
- Member form (create/edit, `MoreDetailsFields`): "More details" is a Collapsible; fields unchanged. Save still opens it on a problem inside.
