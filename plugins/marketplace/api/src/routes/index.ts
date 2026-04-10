/**
 * @module @kb-labs/marketplace-api/routes
 * Register all marketplace API routes.
 */

import type { FastifyInstance } from 'fastify';
import { installRoute } from './install.js';
import { uninstallRoute } from './uninstall.js';
import { updateRoute } from './update.js';
import { listRoute } from './list.js';
import { enableDisableRoute } from './enable-disable.js';
import { linkUnlinkRoute } from './link-unlink.js';
import { doctorRoute } from './doctor.js';
import { syncRoute } from './sync.js';

export async function registerRoutes(server: FastifyInstance): Promise<void> {
  await server.register(async (app) => {
    installRoute(app);
    uninstallRoute(app);
    updateRoute(app);
    listRoute(app);
    enableDisableRoute(app);
    linkUnlinkRoute(app);
    doctorRoute(app);
    syncRoute(app);
  }, { prefix: '/api/v1/marketplace' });
}
