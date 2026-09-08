import {
  emptyHistory,
  LIMITS,
  type CollectionImage,
  type ImageDraft,
  type Revision,
  type SourceImage,
} from "./types";

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
          "Local storage is waiting for another Crafty tab. Close other tabs and reload.",
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
): Promise<T> {
  const db = await database();
  const tx = db.transaction(stores, mode);
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
  }
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
        .map((source) => ({
          source,
          draft: drafts.find((draft) => draft.sourceId === source.id) ?? {
            sourceId: source.id,
            history: emptyHistory(),
            updatedAt: source.createdAt,
          },
          revisions: revisions
            .filter((revision) => revision.sourceId === source.id)
            .map(({ id, sourceId, createdAt }) => ({ id, sourceId, createdAt }))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        }));
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
      return { source, draft, revisions: [] };
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

export function addRevision(revision: Revision): Promise<void> {
  return transaction(["sources", "revisions"], "readwrite", async (tx) => {
    const { sources, revisions } = await checkBudget(tx, revision.png.size);
    if (!sources.some((source) => source.id === revision.sourceId))
      throw new Error("The original image was removed. Reload the workspace.");
    if (
      revisions.filter((item) => item.sourceId === revision.sourceId).length >=
      LIMITS.revisions
    )
      throw new Error(
        "This image has 20 saved revisions. You can still edit and download its current PNG.",
      );
    await result(tx.objectStore("revisions").add(revision));
  });
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
