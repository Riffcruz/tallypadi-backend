# Campaign Services

This folder owns the managed ads/product boost domain.

- `adCampaign.service.ts` coordinates campaign submission, review, provider status, metrics, refunds, top-up, resume, and maintenance.
- `adBudget.service.ts` owns money math, provider normalization, service fee/safety reserve calculation, and deterministic budget splits.
- `providerCredentials.service.ts` reads TallyPadi-owned system ad credentials from backend environment variables and decides whether a provider can run automatically.
- `providerAutomation.service.ts` submits approved provider campaigns through the real Meta, Google, and TikTok adapters when automation is configured.
- `providers/` contains provider-specific HTTP adapters. These files must never read customer credentials; merchants only grant consent for TallyPadi to run ads on their behalf.
- `index.ts` is the public barrel for new imports.

Legacy imports from `src/services/adCampaign.service.ts` and `src/services/adBudget.service.ts` are intentionally kept as compatibility barrels while the rest of the app migrates to `src/services/Campaign`.
