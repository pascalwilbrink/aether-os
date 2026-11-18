import { Global, Module } from '@nestjs/common';

import { ProxenosEvents } from './proxenos-events.service.js';

/** Provides `ProxenosEvents`; needs Krepis's `EventsModule` in the app. */
@Global()
@Module({ providers: [ProxenosEvents], exports: [ProxenosEvents] })
export class ProxenosEventsModule {}
