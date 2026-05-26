# Marketplace Performance Audit

Date: 2026-05-25

## Risk Summary

The current `GET /api/marketplace` implementation is unlikely to handle 10,000 to 100,000 simultaneous visitors without CDN/API caching, query redesign, materialized marketplace listing data, and infrastructure scaling. The route is correct for moderate traffic, but it does too much database and Node.js work per request for viral marketplace traffic.

## Current Bottlenecks

- Full owner query per request: the route loads all eligible Tycoon storefront owners, then filters readiness and location in Node.js.
- Node-side filtering: `isSubActive`, storefront readiness, and location matching happen after Mongo returns owner records, which increases memory and CPU pressure as owners grow.
- Repeated facets: category and location facets are recalculated on every request instead of using cached or precomputed values.
- `countDocuments`: every listing request also counts total matching products, doubling database pressure for common browse traffic.
- Regex search: product/shop search uses multiple unanchored regex predicates, which will not scale well without dedicated search indexes.
- Computed boost sorting: active boosts and `boostScore` are computed in aggregation on each request.
- Client `cache: no-store`: the marketplace frontend bypasses Next/browser caching and forces a fresh API request for every visit/filter load.
- In-memory rate limiting: Express rate limits are per Node process, so PM2 instances do not share limits unless backed by Redis or another shared store.
- Request logging: every request is logged synchronously to stdout, which becomes noisy and expensive under high concurrency.
- PM2 fork scaling: `ecosystem.config.js` uses `exec_mode: 'fork'` with two API instances; for CPU-bound HTTP work, cluster mode or multiple containers behind a load balancer is more appropriate.

## Priority Recommendations

1. Put `/marketplace` and `/marketplace/product/:id` behind CDN caching with short TTL and stale-while-revalidate behavior.
2. Add API-side response caching keyed by page, query, category, state, city, and sort; Redis is already part of the stack.
3. Materialize public marketplace listings into a read-optimized collection containing product, owner, location, verification, boost, and SEO fields.
4. Precompute category and location facets on inventory/storefront changes instead of recalculating them on browse requests.
5. Replace broad regex search with MongoDB Atlas Search or a text/search service once product volume grows.
6. Avoid exact `countDocuments` on every request for hot listing pages; use cached counts or cursor-based pagination.
7. Change marketplace frontend fetches away from `cache: no-store` for default browse pages and allow ISR/CDN caching where filters permit.
8. Move production rate limiting to a shared Redis-backed store.
9. Reduce production request logging for hot public routes or sample it.
10. Validate capacity in staging with a distributed load test that mirrors real traffic patterns, not a single local machine test.
