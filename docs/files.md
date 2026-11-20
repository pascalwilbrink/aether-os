# Files (Loculus)

Status: first form built (`../loculus`): files per project, uploaded and downloaded with signed URLs, stored in S3-compatible storage. Not yet: file artifacts in Hephaestus (the next step), uploads from Iris, refusing uploads in a suspended organization or archived project, sweeping uploads that never finished, retention and deleting a task's files with it (`tasks.md`), events.

Loculus (Latin: a small compartment or niche) keeps Aether-os's files: what agents produce (file artifacts), and later what people upload (task inputs, documents). It holds each file's metadata and issues **signed URLs**; the bytes go straight between the client and the storage and never pass through Loculus or any other service (`../CLAUDE.md`, How the pieces fit).

## Decisions

| Topic | Decision |
|---|---|
| Storage | Any **S3-compatible** object store, through the S3 API (AWS SDK v3): AWS S3 or any other in production, [RustFS](https://rustfs.com) locally (`../docker-compose.yml`). One bucket for Aether-os. |
| Metadata | Loculus's own Postgres database (`files`), like every service. The bucket only holds bytes. |
| Ownership | A file belongs to one **project** of one organization. Every route is under `/v1/organizations/{organizationId}/projects/{projectId}/files`. |
| Object keys | `orgs/{organizationId}/projects/{projectId}/files/{fileId}`: Loculus's own IDs, never a file name, so a name can't reach outside its prefix. The name is metadata. |
| References | Other services keep the **file ID** (and Loculus keeps the object key), never a signed URL: URLs expire, so a fresh one is asked for when the file is needed. |
| Permissions | `file:read` (every project role) and `file:write` (admin, approver, editor; `identity.md`). A task token is a service account's with a project role, so tasks upload and read their project's files with it. |
| Integrity | A file is declared before it's uploaded: name, content type, size and SHA-256. The upload URL is signed **with** the size, type and checksum, so the storage refuses any other bytes, and completing the upload checks what the storage holds against the declaration. |
| Downloads | Always as an attachment (`Content-Disposition: attachment`, with the file's name). Files are never served inline from the storage's origin: an agent's HTML or SVG would run there. Previews are Iris's job. |
| Limits | `FILE_MAX_BYTES` per file (100 MiB by default). Larger files, multipart uploads and resumable uploads later. |

## Uploading

1. `POST …/files` with `fileName`, `contentType`, `sizeBytes` and `sha256` (hex): the file is recorded `pending`, and the answer has an **upload**: a `PUT` URL, the headers to send with it (`content-type` and `x-amz-checksum-sha256`), and when it expires (`UPLOAD_URL_TTL_SECONDS`, 15 minutes).
2. The client `PUT`s the bytes to that URL, with those headers. The storage refuses another size, type or checksum.
3. `POST …/files/{fileId}/complete`: Loculus asks the storage for the object and compares its size and checksum with the declaration. If they match, the file is `available` (idempotent); if the object isn't there or differs, `FILE_UPLOAD_INCOMPLETE` (409) and it stays `pending`, so the client can upload again until the URL expires (a new one comes from `GET …/files/{fileId}/upload`).

Only `available` files can be downloaded.

## Reading and deleting

- `GET …/files` (newest first, `?status=`, cursor pagination) and `GET …/files/{fileId}`: the metadata.
- `GET …/files/{fileId}/download`: a signed `GET` URL (`DOWNLOAD_URL_TTL_SECONDS`, 5 minutes), as an attachment with the file's name. A file still `pending` is `FILE_NOT_AVAILABLE` (409).
- `DELETE …/files/{fileId}`: removes the object and the file (idempotent, `204`). Whoever references it then gets a 404 for it.

## Who uses it

- **Hephaestus** (next): the agent submits a file from its sandbox; Hephaestus reads it out of the sandbox (the sandbox has no network and never sees a URL), uploads it with the task's token and records a `file` artifact with the file's ID (`tasks.md`, Artifacts).
- **Iris** (next): downloads (a fresh URL on each click) and previews of file artifacts; later, uploads.
