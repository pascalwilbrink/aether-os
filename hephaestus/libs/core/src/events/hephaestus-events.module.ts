import { Global, Module } from '@nestjs/common';

import { HephaestusEvents } from './hephaestus-events.service.js';

@Global()
@Module({
  providers: [HephaestusEvents],
  exports: [HephaestusEvents],
})
export class HephaestusEventsModule {}
