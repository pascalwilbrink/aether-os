import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { RequirePermission, ZodSerializerDto } from '@hephaestus/core';

import { sse } from './agui.js';
import { CreateSessionRequest } from './dto/create-session.request.js';
import { ListSessionsQuery } from './dto/list-sessions.query.js';
import { RunAgentInput } from './dto/run-agent-input.js';
import { DeliberationRoundPage } from './dto/deliberation-round-page.response.js';
import { DeliberationRoundsQuery } from './dto/deliberation-rounds.query.js';
import {
  ApproveCouncilPlanRequest,
  RejectCouncilPlanRequest,
  RequestCouncilPlanChangesRequest,
} from './dto/council-plan-decisions.request.js';
import { CouncilPlan, CouncilPlanPage } from './dto/council-plan.response.js';
import { CouncilPlansQuery } from './dto/council-plans.query.js';
import { PlanParams } from './dto/plan.params.js';
import { SessionMessagePage } from './dto/session-message-page.response.js';
import { SessionSynthesesQuery } from './dto/session-syntheses.query.js';
import { SessionSynthesisPage } from './dto/session-synthesis-page.response.js';
import { SetSessionModeRequest } from './dto/set-session-mode.request.js';
import { SessionMessagesQuery } from './dto/session-messages.query.js';
import { SessionPage } from './dto/session-page.response.js';
import { SessionResponse } from './dto/session.response.js';
import { SessionParams } from './dto/session.params.js';
import { SessionsParams } from './dto/sessions.params.js';
import { SessionRunError } from './session-agent.js';
import { SessionRunsService } from './session-runs.service.js';
import { CouncilPlansService } from './council-plans.service.js';
import { SessionsService } from './sessions.service.js';

const IN_PROJECT = { project: 'projectId' };

@Controller('organizations/:organizationId/projects/:projectId/sessions')
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly runs: SessionRunsService,
    private readonly plans: CouncilPlansService,
  ) {}

  @Post()
  @RequirePermission('session:use', IN_PROJECT)
  @ZodSerializerDto(SessionResponse)
  create(
    @Param() { organizationId, projectId }: SessionsParams,
    @Body() body: CreateSessionRequest,
  ) {
    return this.sessions.create(organizationId, projectId, body);
  }

  @Get()
  @RequirePermission('session:use', IN_PROJECT)
  @ZodSerializerDto(SessionPage)
  list(
    @Param() { organizationId, projectId }: SessionsParams,
    @Query() query: ListSessionsQuery,
  ) {
    return this.sessions.list(organizationId, projectId, query);
  }

  @Get(':sessionId')
  @RequirePermission('session:use', IN_PROJECT)
  @ZodSerializerDto(SessionResponse)
  findById(@Param() { organizationId, projectId, sessionId }: SessionParams) {
    return this.sessions.findById(organizationId, projectId, sessionId);
  }

  @Get(':sessionId/messages')
  @RequirePermission('session:use', IN_PROJECT)
  @ZodSerializerDto(SessionMessagePage)
  messages(
    @Param() { organizationId, projectId, sessionId }: SessionParams,
    @Query() query: SessionMessagesQuery,
  ) {
    return this.sessions.messagesOf(
      organizationId,
      projectId,
      sessionId,
      query,
    );
  }

  @Get(':sessionId/rounds')
  @RequirePermission('session:use', IN_PROJECT)
  @ZodSerializerDto(DeliberationRoundPage)
  rounds(
    @Param() { organizationId, projectId, sessionId }: SessionParams,
    @Query() query: DeliberationRoundsQuery,
  ) {
    return this.sessions.roundsOf(organizationId, projectId, sessionId, query);
  }

  @Get(':sessionId/syntheses')
  @RequirePermission('session:use', IN_PROJECT)
  @ZodSerializerDto(SessionSynthesisPage)
  syntheses(
    @Param() { organizationId, projectId, sessionId }: SessionParams,
    @Query() query: SessionSynthesesQuery,
  ) {
    return this.sessions.synthesesOf(
      organizationId,
      projectId,
      sessionId,
      query,
    );
  }

  @Get(':sessionId/plans')
  @RequirePermission('session:use', IN_PROJECT)
  @ZodSerializerDto(CouncilPlanPage)
  plansOf(
    @Param() { organizationId, projectId, sessionId }: SessionParams,
    @Query() query: CouncilPlansQuery,
  ) {
    return this.plans.list(organizationId, projectId, sessionId, query);
  }

  @Post(':sessionId/plans/:planId/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('session:use', IN_PROJECT)
  @ZodSerializerDto(CouncilPlan)
  approvePlan(
    @Param() { organizationId, projectId, sessionId, planId }: PlanParams,
    @Body() body: ApproveCouncilPlanRequest,
  ) {
    return this.plans.approve(
      organizationId,
      projectId,
      sessionId,
      planId,
      body,
    );
  }

  @Post(':sessionId/plans/:planId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('session:use', IN_PROJECT)
  @ZodSerializerDto(CouncilPlan)
  rejectPlan(
    @Param() { organizationId, projectId, sessionId, planId }: PlanParams,
    @Body() body: RejectCouncilPlanRequest,
  ) {
    return this.plans.reject(
      organizationId,
      projectId,
      sessionId,
      planId,
      body,
    );
  }

  @Post(':sessionId/plans/:planId/request-changes')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('session:use', IN_PROJECT)
  @ZodSerializerDto(CouncilPlan)
  requestPlanChanges(
    @Param() { organizationId, projectId, sessionId, planId }: PlanParams,
    @Body() body: RequestCouncilPlanChangesRequest,
  ) {
    return this.plans.requestChanges(
      organizationId,
      projectId,
      sessionId,
      planId,
      body,
    );
  }

  @Post(':sessionId/mode')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('session:use', IN_PROJECT)
  @ZodSerializerDto(SessionResponse)
  setMode(
    @Param() { organizationId, projectId, sessionId }: SessionParams,
    @Body() body: SetSessionModeRequest,
  ) {
    return this.sessions.setMode(
      organizationId,
      projectId,
      sessionId,
      body.mode,
    );
  }

  @Post(':sessionId/end')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('session:use', IN_PROJECT)
  @ZodSerializerDto(SessionResponse)
  end(@Param() { organizationId, projectId, sessionId }: SessionParams) {
    return this.sessions.end(organizationId, projectId, sessionId);
  }

  /** AG-UI over server-sent events; refusals before the stream are problem details. */
  @Post(':sessionId/runs')
  @RequirePermission('session:use', IN_PROJECT)
  async run(
    @Param() { organizationId, projectId, sessionId }: SessionParams,
    @Body() input: RunAgentInput,
    @Headers('authorization') authorization: string,
    @Res() response: Response,
  ): Promise<void> {
    const run = await this.runs.start(
      organizationId,
      projectId,
      sessionId,
      input,
      authorization.replace(/^Bearer\s+/i, ''),
    );
    response.status(HttpStatus.OK);
    response.setHeader('content-type', 'text/event-stream; charset=utf-8');
    response.setHeader('cache-control', 'no-cache, no-transform');
    response.setHeader('x-accel-buffering', 'no');
    response.flushHeaders();
    const client = new AbortController();
    response.on('close', () => {
      if (!response.writableFinished) {
        client.abort(
          new SessionRunError('The client went away.', 'RUN_STOPPED'),
        );
      }
    });
    await run.stream((event) => {
      if (!response.writableEnded) {
        response.write(sse(event));
      }
    }, client.signal);
    response.end();
  }
}
