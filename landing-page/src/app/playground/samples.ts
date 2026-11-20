/** Sample inputs for the playground. Plain data with no imports, so the verification script can load it. */

export type SampleId = "deployment" | "events" | "ledger" | "config";

export interface Sample {
  id: SampleId;
  label: string;
  /** File name shown in the generated command. */
  file: string;
  /** A search term that finds something useful in this sample. */
  term: string;
  /** One sentence on what this sample shows. */
  note: string;
  json: string;
}

const deployment = `{
  "service": "checkout-api",
  "environment": "production",
  "release": {
    "version": "2026.11.3",
    "commit": "8f3c2a1",
    "deployedAt": "2026-11-18T14:02:11Z"
  },
  "replicas": 6,
  "containers": [
    {
      "name": "api",
      "image": "registry.example.com/checkout-api:2026.11.3",
      "ports": [8080, 9090],
      "env": {
        "LOG_LEVEL": "info",
        "DATABASE_URL": "postgres://checkout@db.internal:5432/checkout",
        "FEATURE_FLAGS": "fast-refunds,split-tender"
      },
      "resources": { "cpu": "500m", "memory": "1Gi" }
    },
    {
      "name": "sidecar-proxy",
      "image": "registry.example.com/envoy:1.31.2",
      "ports": [15001],
      "env": {},
      "resources": { "cpu": "100m", "memory": "128Mi" }
    }
  ],
  "healthCheck": { "path": "/healthz", "intervalSeconds": 10, "timeoutSeconds": 2 },
  "rollout": { "strategy": "canary", "steps": [10, 50, 100], "autoPromote": false }
}
`;

const events =
  '[{"id":"evt_01","type":"checkout.completed","ts":"2026-11-18T09:12:44Z","user":{"id":"u_481","plan":"pro"},"amount":129.90,"currency":"USD"},' +
  '{"id":"evt_02","type":"payment.failed","ts":"2026-11-18T09:13:02Z","user":{"id":"u_212","plan":"free"},"error":{"code":"card_declined","message":"Your card was declined.","retryable":false}},' +
  '{"id":"evt_03","type":"checkout.completed","ts":"2026-11-18T09:15:37Z","user":{"id":"u_093","plan":"team"},"amount":48.00,"currency":"EUR"},' +
  '{"id":"evt_04","type":"webhook.failed","ts":"2026-11-18T09:16:10Z","endpoint":"https://hooks.example.com/orders","error":{"code":"timeout","message":"No response after 10s","retryable":true},"attempt":3},' +
  '{"id":"evt_05","type":"refund.created","ts":"2026-11-18T09:20:51Z","user":{"id":"u_481","plan":"pro"},"amount":-129.90,"currency":"USD","reason":null}]\n';

const ledger = `{
  "ledger": "acct-7731",
  "currency": "USD",
  "openingBalance": 1.10,
  "entries": [
    { "id": 12345678901234567890, "amount": 1.10, "memo": "Coffee" },
    { "id": 12345678901234567891, "amount": -250.00, "fx": 1.0850, "memo": "Refund, EUR card" },
    { "id": 9007199254740993, "amount": 1e3, "memo": "Wire in" },
    { "id": 18446744073709551615, "amount": 0.1, "memo": "Interest" }
  ],
  "closingBalance": 752.30
}
`;

const config = `{
  "zeta": true,
  "server": {
    "port": 8443,
    "host": "0.0.0.0",
    "tls": { "enabled": true, "cert": "/etc/ssl/app.pem" }
  },
  "Accept-Language": "en-US",
  "alpha": [3, 1, 2],
  "_internal": { "retries": 3, "backoff": "exponential" },
  "feature.flags": { "newCheckout": false, "darkMode": true },
  "": "empty key",
  "caf\\u00e9": "\\u00fcn\\u00efcode",
  "path\\/escaped": "a\\/b"
}
`;

export const samples: readonly Sample[] = [
  {
    id: "deployment",
    label: "Service deployment payload",
    file: "deployment.json",
    term: "image",
    note: "Nested containers, env vars and rollout steps, the kind of payload a CI log prints.",
    json: deployment,
  },
  {
    id: "events",
    label: "Minified event export",
    file: "events.json",
    term: "failed",
    note: "One minified line. Plain grep would print the whole line; search prints each match with its path.",
    json: events,
  },
  {
    id: "ledger",
    label: "Big-integer financial ledger",
    file: "ledger.json",
    term: "amount",
    note: "IDs above 2^53 and amounts like 1.10 are printed exactly as written, never rounded.",
    json: ledger,
  },
  {
    id: "config",
    label: "Config with reordered keys",
    file: "config.json",
    term: "enabled",
    note: "Keys out of order, keys that need brackets, and escaped strings. Turn on --sort for a stable order.",
    json: config,
  },
];
