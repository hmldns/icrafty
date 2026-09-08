import {
  emptyHistory,
  LIMITS,
  type CollectionImage,
  type ImageDraft,
  type ImageSave,
  type ImageSaveMode,
  type Revision,
  type SavedImageResult,
  type SourceImage,
} from "./types";
import { checkCancelled } from "./imageIO";

const DB_NAME = "crafty-workspace";
type StoreName = "sources" | "drafts" | "revisions";
let connection: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
  connection ??= new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(
        new Error(
          "Local image storage is unavailable in this browser. Try a standard browser window.",
        ),
      );
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("sources", { keyPath: "id" });
      request.result.createObjectStore("drafts", { keyPath: "sourceId" });
      request.result
        .createObjectStore("revisions", { keyPath: "id" })
        .createIndex("sourceId", "sourceId");
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        connection = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      connection = undefined;
      reject(
        new Error(
          "Cannot open local image storage. Allow browser storage or try a standard browser window.",
        ),
      );
    };
    request.onblocked = () => {
      connection = undefined;
      reject(
        new Error(
          "Local storage is waiting for another icrafty tab. Close other tabs and reload.",
        ),
      );
    };
  });
  return connection;
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(
  stores: StoreName[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const db = await database();
  checkCancelled(signal);
  const tx = db.transaction(stores, mode);
  const cancel = () => tx.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const completed = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(
        tx.error ??
          new Error("Local storage could not finish writing. Please retry."),
      );
    tx.onerror = () => {};
  });
  // Attach immediately, including while requests in `work` are still pending.
  void completed.catch(() => undefined);
  try {
    const value = await work(tx);
    await completed;
    return value;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* The transaction may have already ended. */
    }
    await completed.catch(() => undefined);
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

function collectionImage(
  source: SourceImage,
  draft: ImageDraft | undefined,
  revisions: Revision[],
): CollectionImage {
  const history = revisions
    .filter((revision) => revision.sourceId === source.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const saved = history.at(-1) ?? null;
  return {
    source,
    draft: draft ?? {
      sourceId: source.id,
      history: { ...emptyHistory(), present: saved?.marks ?? [] },
      updatedAt: saved?.createdAt ?? source.createdAt,
    },
    saved,
    revisions: history.map(({ id, sourceId, createdAt }) => ({
      id,
      sourceId,
      createdAt,
    })),
  };
}

export function loadCollection(): Promise<CollectionImage[]> {
  return transaction(
    ["sources", "drafts", "revisions"],
    "readonly",
    async (tx) => {
      const [sources, drafts, revisions] = await Promise.all([
        result<SourceImage[]>(tx.objectStore("sources").getAll()),
        result<ImageDraft[]>(tx.objectStore("drafts").getAll()),
        result<Revision[]>(tx.objectStore("revisions").getAll()),
      ]);
      return sources
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((source) =>
          collectionImage(
            source,
            drafts.find((draft) => draft.sourceId === source.id),
            revisions,
          ),
        );
    },
  );
}

async function checkBudget(
  tx: IDBTransaction,
  extraBytes: number,
): Promise<{ sources: SourceImage[]; revisions: Revision[] }> {
  const [sources, revisions] = await Promise.all([
    result<SourceImage[]>(tx.objectStore("sources").getAll()),
    result<Revision[]>(tx.objectStore("revisions").getAll()),
  ]);
  const used =
    sources.reduce((total, source) => total + source.blob.size, 0) +
    revisions.reduce((total, revision) => total + revision.png.size, 0);
  if (used + extraBytes > LIMITS.storageBytes)
    throw new Error(
      "This workspace has reached its 250 MB limit. Download your work, then delete some images to free space.",
    );
  return { sources, revisions };
}

export function addSource(source: SourceImage): Promise<CollectionImage> {
  return transaction(
    ["sources", "drafts", "revisions"],
    "readwrite",
    async (tx) => {
      const { sources } = await checkBudget(tx, source.blob.size);
      if (sources.length >= LIMITS.images)
        throw new Error(
          "This workspace holds up to 40 images. Delete an image before adding another.",
        );
      const draft: ImageDraft = {
        sourceId: source.id,
        history: emptyHistory(),
        updatedAt: source.createdAt,
      };
      await Promise.all([
        result(tx.objectStore("sources").add(source)),
        result(tx.objectStore("drafts").add(draft)),
      ]);
      return { source, draft, revisions: [], saved: null };
    },
  );
}

export function putDraft(draft: ImageDraft): Promise<void> {
  return transaction(["sources", "drafts"], "readwrite", async (tx) => {
    if (!(await result(tx.objectStore("sources").getKey(draft.sourceId))))
      throw new Error(
        "This image was removed in another tab. Reload the workspace.",
      );
    await result(tx.objectStore("drafts").put(draft));
  });
}

function copyName(name: string, sources: SourceImage[]): string {
  const base = name.replace(/\.[^.]+$/, "").slice(0, 120);
  let candidate = `${base} annotated.png`;
  let number = 2;
  while (sources.some((source) => source.name === candidate))
    candidate = `${base} annotated (${number++}).png`;
  return candidate;
}

/** Every explicit save is atomic; previously saved PNGs and marks stay immutable. */
export function saveImage(
  input: ImageSave,
  mode: ImageSaveMode,
  signal?: AbortSignal,
): Promise<SavedImageResult> {
  return transaction(
    ["sources", "drafts", "revisions"],
    "readwrite",
    async (tx) => {
      const parent = await result<SourceImage | undefined>(
        tx.objectStore("sources").get(input.sourceId),
      );
      if (!parent)
        throw new Error(
          "The original image was removed. Reload the workspace.",
        );
      const { sources, revisions } = await checkBudget(
        tx,
        input.png.size + (mode === "copy" ? parent.blob.size : 0),
      );
      const current = collectionImage(parent, undefined, revisions);
      if (mode === "copy" && sources.length >= LIMITS.images)
        throw new Error(
          "This workspace holds up to 40 images. Update this image or delete an image before saving a copy.",
        );
      if (mode === "update" && current.revisions.length >= LIMITS.revisions)
        throw new Error(
          "This image has 20 saved versions. Save as a new image or download its current PNG.",
        );
      // Keep ordering deterministic even if two explicit saves occur in one millisecond.
      const previousTime = current.saved
        ? Date.parse(current.saved.createdAt)
        : 0;
      const createdAt = new Date(
        Math.max(Date.now(), previousTime + 1),
      ).toISOString();
      const source: SourceImage =
        mode === "copy"
          ? {
              ...parent,
              id: crypto.randomUUID(),
              name: copyName(parent.name, sources),
              createdAt,
              lineage: {
                rootSourceId: parent.lineage?.rootSourceId ?? parent.id,
                parentSourceId: parent.id,
                parentRevisionId: current.saved?.id,
              },
            }
          : parent;
      const draft: ImageDraft = {
        sourceId: source.id,
        history: input.history,
        updatedAt: createdAt,
      };
      const revision: Revision = {
        id: crypto.randomUUID(),
        sourceId: source.id,
        createdAt,
        marks: input.history.present,
        png: input.png,
      };
      let parentDraft: ImageDraft | undefined;
      if (mode === "copy") {
        parentDraft = {
          sourceId: parent.id,
          history: { ...emptyHistory(), present: current.saved?.marks ?? [] },
          updatedAt: createdAt,
        };
        await result(tx.objectStore("sources").add(source));
        await result(tx.objectStore("drafts").put(parentDraft));
      }
      // Await each request before issuing the next: a synchronous storage failure
      // must not leave another request promise unobserved when the transaction aborts.
      await result(tx.objectStore("drafts").put(draft));
      await result(tx.objectStore("revisions").add(revision));
      return {
        image: collectionImage(source, draft, [...revisions, revision]),
        parentDraft,
      };
    },
    signal,
  );
}

export function getRevision(id: string): Promise<Revision | undefined> {
  return transaction(["revisions"], "readonly", (tx) =>
    result(tx.objectStore("revisions").get(id)),
  );
}

export function deleteSource(id: string): Promise<void> {
  return transaction(
    ["sources", "drafts", "revisions"],
    "readwrite",
    async (tx) => {
      const keys = await result(
        tx.objectStore("revisions").index("sourceId").getAllKeys(id),
      );
      await Promise.all([
        result(tx.objectStore("sources").delete(id)),
        result(tx.objectStore("drafts").delete(id)),
        ...keys.map((key) => result(tx.objectStore("revisions").delete(key))),
      ]);
    },
  );
}
