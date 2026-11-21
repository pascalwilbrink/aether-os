import type { TaskResponse } from '@hephaestus/tasks';

type Brief = Pick<
  TaskResponse,
  | 'title'
  | 'description'
  | 'expectedOutcome'
  | 'requirements'
  | 'constraints'
  | 'deliverables'
  | 'acceptanceCriteria'
>;

/**
 * The task's brief at the top of the agent's prompt (docs/tasks.md, How the
 * fields are used), in a fixed order: title, description, expected outcome,
 * requirements, constraints, deliverables, then the acceptance criteria it
 * will be held to. Sections without content are left out.
 */
export function briefOf(task: Brief): string {
  const sections = [`# ${task.title}`, task.description];
  if (task.expectedOutcome) {
    sections.push(`## Expected outcome\n\n${task.expectedOutcome}`);
  }
  if (task.requirements.length > 0) {
    sections.push(
      [
        '## Requirements',
        '',
        'What must be implemented:',
        ...task.requirements.map(
          (item) => `- ${item.key}: ${item.description}`,
        ),
      ].join('\n'),
    );
  }
  if (task.constraints.length > 0) {
    sections.push(
      [
        '## Constraints',
        '',
        'Limits on how you do it:',
        ...task.constraints.map((item) => `- ${item.key}: ${item.description}`),
      ].join('\n'),
    );
  }
  if (task.deliverables.length > 0) {
    sections.push(
      [
        '## Deliverables',
        '',
        'Hand over each of these. Submit it with submit_artifact (text or JSON) or submit_file (a file), setting `deliverable` to its key; a pull request is made from your commits in the repository.',
        ...task.deliverables.map((deliverable) => {
          const details = [
            deliverable.kind.replace('_', ' '),
            deliverable.path ? `named ${deliverable.path}` : null,
            deliverable.primary ? 'the main outcome' : null,
          ].filter(Boolean);
          return `- ${deliverable.key} (${details.join(', ')}): ${deliverable.description}`;
        }),
      ].join('\n'),
    );
  }
  const criteria = task.acceptanceCriteria.filter(
    (criterion) => criterion.source !== 'deliverable',
  );
  if (criteria.length > 0) {
    sections.push(
      [
        '## Acceptance criteria',
        '',
        'When you finish, Hephaestus checks these; what fails comes back to you:',
        ...criteria.map((criterion) => {
          const how =
            criterion.check.type === 'command'
              ? ` (runs \`${criterion.check.command}\` in your sandbox; it must exit 0)`
              : criterion.check.type === 'manual'
                ? ' (a reviewer checks it)'
                : '';
          const of = criterion.requirementKey
            ? ` [${criterion.requirementKey}]`
            : '';
          return `- ${criterion.key}${of}: ${criterion.description}${how}`;
        }),
      ].join('\n'),
    );
  }
  return sections.join('\n\n');
}
