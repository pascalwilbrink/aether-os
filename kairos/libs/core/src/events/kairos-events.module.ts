import { Global, Module } from '@nestjs/common';

import { KairosEvents } from './kairos-events.service.js';

/** Provides `KairosEvents`; needs Krepis's `EventsModule` in the app. */
@Global()
@Module({ providers: [KairosEvents], exports: [KairosEvents] })
export class KairosEventsModule {}
