import { InboxMessageEntity, OutboxMessageEntity } from '@aether-os/krepis';

/** Every entity, for the TypeORM CLI and the tests' schema check. */
export const entities = [OutboxMessageEntity, InboxMessageEntity];
