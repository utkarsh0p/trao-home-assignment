// Single Gemini client wrapper. All model calls route through here so retry and
// exponential backoff on 429 exist in exactly one place. PRD §3.10.
