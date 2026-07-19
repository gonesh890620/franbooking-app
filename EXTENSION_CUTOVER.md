# Extension Cutover Plan

The Chrome extension is the recruiters' main tool. Do not point it at Vercel
until the Vercel API passes recruiter workflow testing.

## Current Extension Flow

```text
combined-extension/panel.js -> GAS ?api=...
combined-extension/background.js -> Anthropic + GAS credit/check logging
```

## Target Flow

```text
combined-extension/panel.js -> Vercel /api/extension/...
combined-extension/background.js -> Vercel profile-selection endpoint
Vercel API -> Supabase operational tables
Vercel background sync -> Google Sheets if needed
```

## Required Compatibility Endpoints

The extension currently expects these `api` names:

- `login`
- `loginBootstrap`
- `bootstrap`
- `usage`
- `tasks`
- `clients`
- `clientRatio`
- `contacts`
- `outreachTpl`
- `nurtureTpl`
- `saveStatus`
- `saveOutreach`
- `saveNurture`
- `checkLiDup`
- `timeLogStart`
- `timeLogEnd`
- `timeLogPing`
- `aiOutreach`
- `aiRewriteOutreach`
- `aiNurture`
- `aiRewriteNurture`
- `markNotInterested`
- `markProfileRestricted`
- `targetArea`
- `unsureCriteria`
- `billingStats`
- `referralStats`
- `requestCredits`
- `logProfileSelection`
- `checkProfileCredit`
- `bulkSetCany`
- `submitLeave`
- `submitFeedback`

## Rollout Steps

1. Build Vercel compatibility endpoints.
2. Run extension against a staging Vercel URL with test users.
3. Compare output with current GAS for the same recruiter.
4. Pilot with 1-2 recruiters.
5. Add a configurable API base URL to the extension.
6. Reload/update the extension only after pilot passes.
