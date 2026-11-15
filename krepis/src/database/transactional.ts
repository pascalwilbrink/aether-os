import { DataSource, type DataSourceOptions } from 'typeorm';
import {
  addTransactionalDataSource,
  deleteDataSourceByName,
  getDataSourceByName,
  initializeTransactionalContext,
  StorageDriver,
} from 'typeorm-transactional';

let initialized = false;

/**
 * Sets up `typeorm-transactional` (docs/engineering.md). Call once, in
 * `main.ts` before Nest boots, and in test setup. Safe to call again.
 */
export function initializeTransactions(): void {
  if (!initialized) {
    initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });
    initialized = true;
  }
}

/**
 * Creates a DataSource that `@Transactional()` methods use, for
 * `TypeOrmModule.forRootAsync({ dataSourceFactory })`. A data source already
 * registered under the same name (an earlier app in the same test run) is
 * replaced.
 */
export function createTransactionalDataSource(
  options: DataSourceOptions,
  name = 'default',
): DataSource {
  initializeTransactions();
  if (getDataSourceByName(name)) {
    deleteDataSourceByName(name);
  }

  return addTransactionalDataSource({
    name,
    dataSource: new DataSource(options),
  });
}

export {
  Propagation,
  runOnTransactionCommit,
  runOnTransactionRollback,
  Transactional,
} from 'typeorm-transactional';
