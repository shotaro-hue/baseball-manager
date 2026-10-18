// A local dev-server connection can reset before source instrumentation runs.
// Playwright retries only ECONNRESET here; HTTP errors and persistent failures
// still reach the test, and all returned source bytes are preserved.
export function fetchInstrumentationSource(route){return route.fetch({maxRetries:1});}
