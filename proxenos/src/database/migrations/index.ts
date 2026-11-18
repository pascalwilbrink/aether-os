import { Initial1795023066097 } from './1795023066097-Initial.js';
import { PullRequests1795028853653 } from './1795028853653-PullRequests.js';
import { WebhookDeliveryOrganization1795045099928 } from './1795045099928-WebhookDeliveryOrganization.js';

/**
 * Every migration, oldest first. Generate one with
 * `pnpm build && pnpm migration:generate src/database/migrations/<Name>`,
 * review it, and add it here. Migrations must stay compatible with the
 * previous release (expand, then contract): there are no down migrations.
 */
export const migrations = [
  Initial1795023066097,
  PullRequests1795028853653,
  WebhookDeliveryOrganization1795045099928,
];
