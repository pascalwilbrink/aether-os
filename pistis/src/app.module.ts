import { Module } from '@nestjs/common';

import { DatabaseModule, pistisConfigModule } from '@pistis/core';
import { OidcModule } from '@pistis/oidc';
import { UsersModule } from '@pistis/users';

// Validation, the /v1 prefix and problem details: configureHttpApp (main.ts).
@Module({
  imports: [pistisConfigModule(), DatabaseModule, UsersModule, OidcModule],
})
export class AppModule {}
