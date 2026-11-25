"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { messageOf } from "@/lib/api/messages";
import {
  createPerson,
  deletePerson,
  updatePerson,
  type PersonRequest,
} from "@/lib/api/polis";
import { requireAdmin } from "@/lib/auth/current";
import {
  departmentIdsOf,
  optionalTextOf,
  textOf,
  valuesOf,
  type FormState,
} from "@/lib/forms";
import { orgPath } from "@/lib/pages";

// Each Server Function checks the person itself: it's its own endpoint.

const personOf = (form: FormData): PersonRequest => ({
  name: textOf(form, "name"),
  email: textOf(form, "email"),
  description: textOf(form, "description"),
  role: optionalTextOf(form, "role"),
  gender: optionalTextOf(form, "gender"),
  departmentIds: departmentIdsOf(form),
});

export async function createPersonAction(
  organizationId: string,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const path = orgPath(organizationId, "/people");
  const { accessToken } = await requireAdmin(organizationId, path);
  let id: string;
  try {
    id = (await createPerson(accessToken, organizationId, personOf(form))).id;
  } catch (error) {
    return { error: messageOf(error), values: valuesOf(form) };
  }
  redirect(`${path}/${id}`);
}

export async function updatePersonAction(
  organizationId: string,
  personId: string,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const path = orgPath(organizationId, `/people/${personId}`);
  const { accessToken } = await requireAdmin(organizationId, path);
  try {
    await updatePerson(accessToken, organizationId, personId, personOf(form));
  } catch (error) {
    return { error: messageOf(error), values: valuesOf(form) };
  }
  revalidatePath(path);
  return { saved: true };
}

export async function deletePersonAction(
  organizationId: string,
  personId: string,
): Promise<FormState> {
  const path = orgPath(organizationId, "/people");
  const { accessToken } = await requireAdmin(organizationId, path);
  try {
    await deletePerson(accessToken, organizationId, personId);
  } catch (error) {
    return { error: messageOf(error) };
  }
  redirect(path);
}
