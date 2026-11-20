import { Global, Module } from '@nestjs/common';

import { PylonEvents } from './pylon-events.service.js';

/** Provides `PylonEvents`; needs Krepis's `EventsModule` in the app. */
@Global()
@Module({ providers: [PylonEvents], exports: [PylonEvents] })
export class PylonEventsModule {}
