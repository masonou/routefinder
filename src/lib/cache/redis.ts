import { Redis } from "@upstash/redis";

export interface RedisConfig {
  url: string;
  token: string;
}

type RedisEnvironment = Record<string, string | undefined>;

function getEnvironmentValue(
  environment: RedisEnvironment,
  name: string
): string | undefined {
  const value = environment[name]?.trim();
  return value || undefined;
}

export function getRedisConfig(
  environment: RedisEnvironment = process.env
): RedisConfig | null {
  const url =
    getEnvironmentValue(environment, "UPSTASH_REDIS_REST_URL") ??
    getEnvironmentValue(environment, "KV_REST_API_URL");
  const token =
    getEnvironmentValue(environment, "UPSTASH_REDIS_REST_TOKEN") ??
    getEnvironmentValue(environment, "KV_REST_API_TOKEN");

  return url && token ? { url, token } : null;
}

// This is imported only by server-side search caching code.
export function getRedisClient(
  environment: RedisEnvironment = process.env
): Redis | null {
  const config = getRedisConfig(environment);
  return config ? new Redis(config) : null;
}
