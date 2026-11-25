import { Global, Module } from '@nestjs/common';

import { PistisEvents } from './pistis-events.service.js';

/** Provides `PistisEvents`; needs Krepis's `EventsModule` in the app. */
@Global()
@Module({ providers: [PistisEvents], exports: [PistisEvents] })
export class PistisEventsModule {}
