import assert from "node:assert/strict";
import test from "node:test";

import { getRedisConfig } from "./redis.ts";

test("explicit Upstash Redis variables take priority over legacy Vercel KV variables", () => {
  assert.deepEqual(
    getRedisConfig({
      UPSTASH_REDIS_REST_URL: "https://upstash.example",
      UPSTASH_REDIS_REST_TOKEN: "upstash-token",
      KV_REST_API_URL: "https://legacy.example",
      KV_REST_API_TOKEN: "legacy-token",
    }),
    {
      url: "https://upstash.example",
      token: "upstash-token",
    }
  );
});

test("legacy Vercel KV variables are supported when explicit variables are absent", () => {
  assert.deepEqual(
    getRedisConfig({
      KV_REST_API_URL: "https://legacy.example",
      KV_REST_API_TOKEN: "legacy-token",
    }),
    {
      url: "https://legacy.example",
      token: "legacy-token",
    }
  );
});

test("Redis remains optional when no complete configuration is available", () => {
  assert.equal(getRedisConfig({}), null);
  assert.equal(
    getRedisConfig({ UPSTASH_REDIS_REST_URL: "https://upstash.example" }),
    null
  );
});
