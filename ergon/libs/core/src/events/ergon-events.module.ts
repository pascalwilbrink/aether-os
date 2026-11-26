import { Global, Module } from '@nestjs/common';

import { ErgonEvents } from './ergon-events.service.js';

/** Provides `ErgonEvents`; needs Krepis's `EventsModule` in the app. */
@Global()
@Module({ providers: [ErgonEvents], exports: [ErgonEvents] })
export class ErgonEventsModule {}
