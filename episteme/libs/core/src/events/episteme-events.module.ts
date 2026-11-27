import { Global, Module } from '@nestjs/common';

import { EpistemeEvents } from './episteme-events.service.js';

/** Provides `EpistemeEvents`; needs Krepis's `EventsModule` in the app. */
@Global()
@Module({ providers: [EpistemeEvents], exports: [EpistemeEvents] })
export class EpistemeEventsModule {}
