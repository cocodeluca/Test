import type { Plugin } from 'vite';
import {
  createBrokerApiApplication,
  type BrokerApiPluginOptions,
} from './apiApplication';

export { createBrokerApiApplication } from './apiApplication';
export type {
  BrokerApiApplication,
  BrokerApiPluginOptions,
  BrokerApiRoute,
} from './apiApplication';

/** Thin Vite development transport; all routes and handlers live in apiApplication. */
export const brokerApiPlugin = (options: BrokerApiPluginOptions = {}): Plugin => ({
  name: 'broker-api-plugin',
  configureServer(server) {
    const application = createBrokerApiApplication(options);
    for (const route of application.routes) {
      server.middlewares.use(route.path, route.handle);
    }
  },
});
