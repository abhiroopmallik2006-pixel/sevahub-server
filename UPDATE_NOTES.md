# SevaHub workflow update

1. Run `database/schema.sql` for a new database, or apply `database/migrations/20260829_booking_workflow.sql` to an existing database.
2. Copy `.env.example` to `.env` and set database/JWT values. AI chat works with the built-in safe SevaHub help fallback when `AI_API_KEY` is blank; set `AI_API_KEY` and `AI_MODEL` to enable an OpenAI-compatible provider.
3. Install dependencies with `npm install`, then run `npm start`.

The TPIN verification value is SHA-256 hashed. A customer-only display value is retained so the customer can retrieve their TPIN after a page refresh; it is excluded from every worker booking response.
