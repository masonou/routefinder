// Example endpoints can trigger external API traffic, so deployed applications hide them.
export function getDevelopmentEndpointUnavailableStatus(
  nodeEnvironment = process.env.NODE_ENV
): 404 | undefined {
  return nodeEnvironment === "production" ? 404 : undefined;
}
