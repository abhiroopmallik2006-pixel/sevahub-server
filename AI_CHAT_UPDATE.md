# AI + Worker Chat Update

- AI now keeps a short per-user conversation history in server memory when a real AI API key is configured.
- AI prompt is general-purpose and responds naturally to greetings, Hinglish, general questions, coding/study/project questions, troubleshooting, and SevaHub questions.
- SevaHub service prices are loaded from the database and supplied as context.
- Without an API key, the app remains usable with a richer local fallback, but it is not a full general-purpose LLM.
- Worker bookings now show **Chat with customer** for every booking, not only accepted bookings.

For real AI, set `AI_API_KEY` in `.env`. The provider is OpenAI-compatible and can be changed with `AI_BASE_URL` and `AI_MODEL`.
