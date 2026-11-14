import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';
import {
  DataSource,
  type EntityManager,
  type EntityTarget,
  type ObjectLiteral,
  type Repository,
} from 'typeorm';

import { TransactionManager } from './transaction-manager.js';

@Injectable()
export class TypeOrmTransactionManager extends TransactionManager {
  private readonly storage = new AsyncLocalStorage<EntityManager>();

  constructor(private readonly dataSource: DataSource) {
    super();
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    // Nested calls join the outer transaction.
    if (this.storage.getStore()) {
      return work();
    }

    return this.dataSource.transaction((manager) =>
      this.storage.run(manager, work),
    );
  }

  /** Repository bound to the active transaction, or the default connection. */
  getRepository<T extends ObjectLiteral>(
    target: EntityTarget<T>,
  ): Repository<T> {
    const manager = this.storage.getStore() ?? this.dataSource.manager;

    return manager.getRepository(target);
  }
}
