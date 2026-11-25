"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { messageOf } from "@/lib/api/messages";
import {
  archiveDepartment,
  createDepartment,
  updateDepartment,
} from "@/lib/api/polis";
import { requireAdmin } from "@/lib/auth/current";
import { textOf, valuesOf, type FormState } from "@/lib/forms";
import { orgPath } from "@/lib/pages";

// Each Server Function checks the person itself: it's its own endpoint.

export async function createDepartmentAction(
  organizationId: string,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const path = orgPath(organizationId, "/departments");
  const { accessToken } = await requireAdmin(organizationId, path);
  let id: string;
  try {
    id = (
      await createDepartment(accessToken, organizationId, {
        name: textOf(form, "name"),
        slug: textOf(form, "slug"),
        description: textOf(form, "description"),
      })
    ).id;
  } catch (error) {
    return { error: messageOf(error), values: valuesOf(form) };
  }
  redirect(`${path}/${id}`);
}

export async function updateDepartmentAction(
  organizationId: string,
  departmentId: string,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const path = orgPath(organizationId, `/departments/${departmentId}`);
  const { accessToken } = await requireAdmin(organizationId, path);
  try {
    await updateDepartment(accessToken, organizationId, departmentId, {
      name: textOf(form, "name"),
      description: textOf(form, "description"),
    });
  } catch (error) {
    return { error: messageOf(error), values: valuesOf(form) };
  }
  revalidatePath(path);
  return { saved: true };
}

export async function archiveDepartmentAction(
  organizationId: string,
  departmentId: string,
): Promise<FormState> {
  const path = orgPath(organizationId, `/departments/${departmentId}`);
  const { accessToken } = await requireAdmin(organizationId, path);
  try {
    await archiveDepartment(accessToken, organizationId, departmentId);
  } catch (error) {
    return { error: messageOf(error) };
  }
  revalidatePath(path);
  return {};
}
