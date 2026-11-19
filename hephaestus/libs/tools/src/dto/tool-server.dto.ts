import {
  createZodDto,
  zCreateToolServerRequest,
  zGetToolServerPath,
  zListToolServersPath,
  zSetToolServerCredentialRequest,
  zToolList,
  zToolServerList,
  zToolServerResponse,
  zUpdateToolServerRequest,
} from '@hephaestus/core';

export class CreateToolServerRequest extends createZodDto(
  zCreateToolServerRequest,
) {}
export class UpdateToolServerRequest extends createZodDto(
  zUpdateToolServerRequest,
) {}
export class SetToolServerCredentialRequest extends createZodDto(
  zSetToolServerCredentialRequest,
) {}
export class ToolServerResponse extends createZodDto(zToolServerResponse) {}
export class ToolServerList extends createZodDto(zToolServerList) {}
export class ToolList extends createZodDto(zToolList) {}

/** `:organizationId`. */
export class ToolServersParams extends createZodDto(zListToolServersPath) {}

/** `:organizationId` and `:toolServerId`. */
export class ToolServerParams extends createZodDto(zGetToolServerPath) {}
