import { Module } from '@nestjs/common';

import { TransactionManager } from './transaction-manager.js';
import { TypeOrmTransactionManager } from './typeorm-transaction-manager.js';

@Module({
  providers: [
    TypeOrmTransactionManager,
    { provide: TransactionManager, useExisting: TypeOrmTransactionManager },
  ],
  exports: [TransactionManager, TypeOrmTransactionManager],
})
export class TransactionModule {}
