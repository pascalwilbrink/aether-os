import { Global, Module } from '@nestjs/common';

import { PolisEvents } from './polis-events.service.js';

/** Provides `PolisEvents`; needs Krepis's `EventsModule` in the app. */
@Global()
@Module({ providers: [PolisEvents], exports: [PolisEvents] })
export class PolisEventsModule {}
