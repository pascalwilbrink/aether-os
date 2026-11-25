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
import { CouncilPlanEntity } from './council-plan.entity.js';
import type { WrittenSynthesis } from './decisions.js';
import { SessionSynthesisEntity } from './session-synthesis.entity.js';
import { DeliberationRoundEntity } from './deliberation-round.entity.js';
import type { Round } from './deliberation.js';
import type { ProposedPlan } from './plans.js';
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
    @InjectRepository(DeliberationRoundEntity)
    private readonly rounds: Repository<DeliberationRoundEntity>,
    @InjectRepository(CouncilPlanEntity)
    private readonly plans: Repository<CouncilPlanEntity>,
    @InjectRepository(SessionSynthesisEntity)
    private readonly syntheses: Repository<SessionSynthesisEntity>,
    private readonly mapper: SessionMapper,
  ) {}

  /** A council session's deliberation rounds, oldest first. */
  async roundsPage(
    sessionId: string,
    page: PageRequest,
  ): Promise<Page<ApiTypes.DeliberationRound>> {
    const entities = await findPage(
      this.rounds,
      { where: { sessionId }, sortBy: 'number', direction: 'ASC' },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toRoundResponse(entity));
  }

  /** A council session's syntheses, oldest first. */
  async synthesesPage(
    sessionId: string,
    page: PageRequest,
  ): Promise<Page<ApiTypes.SessionSynthesis>> {
    const entities = await findPage(
      this.syntheses,
      { where: { sessionId }, sortBy: 'number', direction: 'ASC' },
      page,
    );
    return mapPage(entities, (entity) =>
      this.mapper.toSynthesisResponse(entity),
    );
  }

  /** How many syntheses the session has, for a run. */
  synthesisCount(sessionId: string): Promise<number> {
    return this.syntheses.count({ where: { sessionId } });
  }

  /** Keeps the syntheses a run wrote. */
  async saveSyntheses(
    sessionId: string,
    written: readonly WrittenSynthesis[],
  ): Promise<void> {
    if (written.length > 0) {
      await this.syntheses.insert(
        written.map((synthesis) =>
          this.mapper.toSynthesisEntity(sessionId, synthesis),
        ),
      );
    }
  }

  /** Every plan of the session, oldest first, for a run. */
  plansOf(sessionId: string): Promise<CouncilPlanEntity[]> {
    return this.plans.find({ where: { sessionId }, order: { number: 'ASC' } });
  }

  /**
   * Keeps the plans a run proposed; a new one supersedes a proposal still
   * waiting for a decision.
   */
  async savePlans(
    sessionId: string,
    proposed: readonly ProposedPlan[],
  ): Promise<CouncilPlanEntity[]> {
    if (proposed.length === 0) {
      return [];
    }
    await this.plans.update(
      { sessionId, status: 'proposed' },
      { status: 'superseded' },
    );
    const entities = proposed.map((plan, index) => {
      const entity = this.mapper.toPlanEntity(sessionId, plan);
      // Only the run's last proposal still waits.
      return index < proposed.length - 1
        ? Object.assign(entity, { status: 'superseded' as const })
        : entity;
    });
    await this.plans.insert(entities);
    return entities;
  }

  /** Every round of the session, for a run. */
  async roundsOf(sessionId: string): Promise<Round[]> {
    const entities = await this.rounds.find({
      where: { sessionId },
      order: { number: 'ASC' },
    });
    return entities.map((entity) => this.mapper.toRound(entity));
  }

  /** Keeps the rounds a run opened or concluded (before its messages, which name them). */
  async saveRounds(sessionId: string, rounds: readonly Round[]): Promise<void> {
    if (rounds.length > 0) {
      await this.rounds.save(
        rounds.map((round) => this.mapper.toRoundEntity(sessionId, round)),
      );
    }
  }

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
