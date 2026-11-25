import type { Department } from "@/lib/api/polis";

/**
 * Checkboxes for the organization's departments (`departmentIds`): the
 * active ones, and archived ones only while checked (Polis keeps someone in
 * an archived department, but takes no one new).
 */
export function DepartmentsField({
  departments,
  checked,
}: {
  departments: Department[];
  checked: string[];
}) {
  const shown = departments.filter(
    (department) =>
      department.status === "active" || checked.includes(department.id),
  );
  return (
    <fieldset className="text-sm">
      <legend>Departments</legend>
      {shown.length === 0 ? (
        <p className="mt-1 text-zinc-500">The organization has no departments.</p>
      ) : (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {shown.map((department) => (
            <label key={department.id} className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                name="departmentIds"
                value={department.id}
                defaultChecked={checked.includes(department.id)}
              />
              {department.name}
              {department.status === "archived" ? (
                <span className="text-zinc-500">(archived)</span>
              ) : null}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
