import { Global, Module } from '@nestjs/common';

import { AgoraEvents } from './agora-events.service.js';

/** Provides `AgoraEvents`; needs Krepis's `EventsModule` in the app. */
@Global()
@Module({ providers: [AgoraEvents], exports: [AgoraEvents] })
export class AgoraEventsModule {}
