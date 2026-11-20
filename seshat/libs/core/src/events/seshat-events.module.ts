import { Global, Module } from '@nestjs/common';

import { SeshatEvents } from './seshat-events.service.js';

/** Provides `SeshatEvents`; needs Krepis's `EventsModule` in the app. */
@Global()
@Module({ providers: [SeshatEvents], exports: [SeshatEvents] })
export class SeshatEventsModule {}
