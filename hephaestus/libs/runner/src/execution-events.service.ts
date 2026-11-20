import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, type Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import { isUniqueViolation, type ApiTypes } from '@hephaestus/core';

import {
  ExecutionActivity,
  type NewExecutionEvent,
} from './execution-activity.js';
import { ExecutionEventEntity } from './execution-event.entity.js';
import { ExecutionHistory } from './execution-history.js';

/**
 * Executions' activity logs (docs/tasks.md, Activity): the runner and the
 * agent runtime record into one (`activityFor`); people follow it
 * (`GET …/executions/{executionId}/events`).
 */
@Injectable()
export class ExecutionEventsService {
  constructor(
    @InjectRepository(ExecutionEventEntity)
    private readonly events: Repository<ExecutionEventEntity>,
    private readonly history: ExecutionHistory,
  ) {}

  /** An execution's activity log, to record into. */
  activityFor(executionId: string): ExecutionActivity {
    return new ExecutionActivity(executionId, (id, event) =>
      this.append(id, event),
    );
  }

  /**
   * Adds an event as the execution's next (its sequence, from the table);
   * tried again if another writer took that number first.
   */
  private async append(
    executionId: string,
    event: NewExecutionEvent,
  ): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.events.query(
          `INSERT INTO execution_events
             (id, execution_id, sequence, type, level, message, tool_name, input, output, text, input_tokens, output_tokens, created_at)
           SELECT $1, $2, COALESCE(MAX(sequence), 0) + 1, $3, $4, $5, $6, $7, $8, $9, $10, $11, now()
           FROM execution_events WHERE execution_id = $2`,
          [
            uuidv7(),
            executionId,
            event.type,
            event.level,
            event.message,
            event.toolName,
            event.input,
            event.output,
            event.text,
            event.inputTokens,
            event.outputTokens,
          ],
        );
        return;
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= 3) {
          throw error;
        }
      }
    }
  }

  /** What came after `after`, oldest first, and whether it's still going. */
  async list(
    organizationId: string,
    projectId: string,
    taskId: string,
    executionId: string,
    query: { after: number; limit: number },
  ): Promise<ApiTypes.ExecutionEventPage> {
    // 404 for another task's, project's or organization's execution.
    const executionStatus = await this.history.statusOf(
      organizationId,
      projectId,
      taskId,
      executionId,
    );
    const entities = await this.events.find({
      where: { executionId, sequence: MoreThan(query.after) },
      order: { sequence: 'ASC' },
      take: query.limit,
    });
    return {
      items: entities.map((entity) => ({
        sequence: entity.sequence,
        type: entity.type,
        level: entity.level,
        message: entity.message,
        toolName: entity.toolName,
        input: entity.input,
        output: entity.output,
        text: entity.text,
        inputTokens: entity.inputTokens,
        outputTokens: entity.outputTokens,
        createdAt: entity.createdAt.toISOString(),
      })),
      nextAfter: entities.at(-1)?.sequence ?? query.after,
      executionStatus,
    };
  }
}
