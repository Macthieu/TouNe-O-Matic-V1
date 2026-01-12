export const AppConfig = {
  // UI-only demo. When you wire APIs later, change to "rest" or "ws" and provide endpoints.
  transport: "rest", // "mock" | "rest" | "ws"
  restBaseUrl: "/api", // future: your backend reverse-proxy base
  wsUrl: null,        // future: "ws://..."
  refreshMs: 1000,
};
