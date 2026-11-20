import Link from "next/link";
import { Suspense } from "react";

import { ActionButton } from "@/app/components/action-forms";
import { ModelKeyForm } from "@/app/components/model-key-form";
import { listModelKeys } from "@/lib/api/hephaestus";
import { getOrganization } from "@/lib/api/polis";
import { requireOrganization } from "@/lib/auth/current";
import { isSelfHosted, PROVIDERS } from "@/lib/model-keys";
import { formatTime } from "@/lib/tasks";

import { deleteModelKeyAction, setModelKeyAction } from "./actions";

type Props = PageProps<"/orgs/[organizationId]/model-keys">;

/** The organization's provider API keys, which its agents use for their models. */
export default function ModelKeysPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ModelKeys {...props} />
    </Suspense>
  );
}

async function ModelKeys({ params }: Props) {
  const { organizationId } = await params;
  const session = await requireOrganization(
    organizationId,
    `/orgs/${organizationId}/model-keys`,
  );
  const token = session.accessToken;
  const [organization, keys] = await Promise.all([
    getOrganization(token, organizationId),
    listModelKeys(token, organizationId),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href={`/orgs/${organizationId}`} className="underline">
            {organization.name}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">Model keys</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Your API keys for model providers. An agent calls its model with the
          organization&apos;s key for that provider, unless the agent has its
          own (set on its page). Keys are stored in a secrets store and never
          shown again: only their last characters, to tell them apart. Owners
          and admins can set them.
        </p>
      </div>

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {PROVIDERS.map(({ provider, name }) => {
          const key = keys.items.find((item) => item.provider === provider);
          const ref = { organizationId, provider };
          return (
            <li key={provider} className="space-y-2 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="font-medium">{name}</h2>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {key ? (
                      <>
                        {key.baseUrl ? (
                          <>
                            Server:{" "}
                            <span className="font-mono">{key.baseUrl}</span> ·{" "}
                            {key.hint ? (
                              <>
                                key{" "}
                                <span className="font-mono">{key.hint}</span>
                              </>
                            ) : (
                              "no key"
                            )}
                          </>
                        ) : (
                          <>
                            Set: <span className="font-mono">{key.hint}</span>
                          </>
                        )}{" "}
                        · by {key.updatedBy} on {formatTime(key.updatedAt)}
                      </>
                    ) : isSelfHosted(provider) ? (
                      "Not set: your own Ollama server, its URL and (if it wants one) a key. Its models aren't priced."
                    ) : (
                      "Not set: agents with a model from here need a key of their own."
                    )}
                  </p>
                </div>
                {key ? (
                  <ActionButton
                    action={deleteModelKeyAction.bind(null, ref)}
                    label="Remove"
                    pendingLabel="Removing…"
                    confirmText={`Remove the organization's ${name} key? Agents without their own key can't call ${name} models until there's a new one.`}
                  />
                ) : null}
              </div>
              <ModelKeyForm
                action={setModelKeyAction.bind(null, ref)}
                label={
                  isSelfHosted(provider)
                    ? `${name} API key (optional)`
                    : `${name} API key`
                }
                replacing={Boolean(key)}
                baseUrl={
                  isSelfHosted(provider) ? (key?.baseUrl ?? "") : undefined
                }
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
