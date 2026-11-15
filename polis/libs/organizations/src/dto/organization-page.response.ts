import { createZodDto, zOrganizationPage } from '@polis/core';

/** Newest first. */
export class OrganizationPage extends createZodDto(zOrganizationPage) {}
