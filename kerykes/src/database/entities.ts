import { InboxMessageEntity, OutboxMessageEntity } from '@aether-os/krepis';

import {
  OrganizationMemberEntity,
  OrganizationSyncEntity,
  ProjectMemberEntity,
} from '../../libs/memberships/src/membership.entities.js';
import {
  EmailDeliveryEntity,
  NotificationEntity,
} from '../../libs/notifications/src/notification.entities.js';

/** Every entity, for the TypeORM CLI and the tests' schema check. */
export const entities = [
  OrganizationMemberEntity,
  ProjectMemberEntity,
  OrganizationSyncEntity,
  NotificationEntity,
  EmailDeliveryEntity,
  OutboxMessageEntity,
  InboxMessageEntity,
];
