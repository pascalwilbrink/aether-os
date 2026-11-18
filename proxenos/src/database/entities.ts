import { OutboxMessageEntity } from '@aether-os/krepis';

import { ConnectRequestEntity } from '../../libs/installations/src/connect-request.entity.js';
import { InstallationEntity } from '../../libs/installations/src/installation.entity.js';
import { RepositoryEntity } from '../../libs/installations/src/repository.entity.js';
import { WebhookDeliveryEntity } from '../../libs/installations/src/webhook-delivery.entity.js';
import { RepositoryLinkEntity } from '../../libs/repositories/src/repository-link.entity.js';

/** Every entity, for the TypeORM CLI and the tests' schema check. */
export const entities = [
  InstallationEntity,
  RepositoryEntity,
  ConnectRequestEntity,
  WebhookDeliveryEntity,
  RepositoryLinkEntity,
  OutboxMessageEntity,
];
