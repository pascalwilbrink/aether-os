import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  findPage,
  mapPage,
  type ApiTypes,
  type Page,
  type PageRequest,
} from '@hephaestus/core';

import type { SessionHistoryMessage } from './session-agent.js';
import { SessionMessageEntity } from './session-message.entity.js';
import { SessionMapper } from './session.mapper.js';

/**
 * A session's messages, numbered in order. Appending is done while the
 * session's row is locked (`SessionsService`), so ordinals don't collide.
 */
@Injectable()
export class SessionMessagesService {
  constructor(
    @InjectRepository(SessionMessageEntity)
    private readonly messages: Repository<SessionMessageEntity>,
    private readonly mapper: SessionMapper,
  ) {}

  async page(
    sessionId: string,
    page: PageRequest,
  ): Promise<Page<ApiTypes.SessionMessage>> {
    const entities = await findPage(
      this.messages,
      { where: { sessionId }, sortBy: 'ordinal', direction: 'ASC' },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toMessage(entity));
  }

  /** Everything, oldest first: the agent's history. */
  async history(sessionId: string): Promise<SessionHistoryMessage[]> {
    const entities = await this.messages.find({
      where: { sessionId },
      order: { ordinal: 'ASC' },
    });
    return entities.map((entity) => this.mapper.toHistory(entity));
  }

  async append(
    sessionId: string,
    messages: readonly SessionHistoryMessage[],
    now: Date,
  ): Promise<void> {
    if (messages.length === 0) {
      return;
    }
    const last = await this.messages
      .createQueryBuilder('message')
      .select('COALESCE(MAX(message.ordinal), 0)', 'last')
      .where('message.session_id = :sessionId', { sessionId })
      .getRawOne<{ last: number }>();
    let ordinal = Number(last?.last ?? 0);
    await this.messages.insert(
      messages.map((message) =>
        this.mapper.toMessageEntity(sessionId, ++ordinal, message, now),
      ),
    );
  }
}
