import { ConnectorRegistry } from '@oms/marketplace-core';
import { createAmazonInConnector } from '@oms/connector-amazon-in';
import { createFlipkartConnector } from '@oms/connector-flipkart';
import { createMyntraConnector } from '@oms/connector-myntra';
import { createSnapdealConnector } from '@oms/connector-snapdeal';
import { createMockConnector } from '@oms/connector-mock';

export { mockControl } from '@oms/connector-mock';

/**
 * The ONLY place that knows every concrete connector. Adding a marketplace =
 * new package under integrations/marketplace/<name> + one line here. Core code never changes.
 *
 * `mock` (sandbox) is registered unless disabled; production keeps it off unless MOCK_MARKETPLACE_ENABLED=true.
 */
export function createConnectorRegistry(opts: { mock?: boolean } = {}): ConnectorRegistry {
  const registry = new ConnectorRegistry()
    .register(createAmazonInConnector())
    .register(createFlipkartConnector())
    .register(createMyntraConnector())
    .register(createSnapdealConnector());
  if (opts.mock ?? true) registry.register(createMockConnector());
  return registry;
}
