const DIRECTORY_PATH = "/.well-known/nostr.json";

export function createDirectoryCacheKey(
  requestUrl: string,
  normalizedName: string,
): Request {
  const url = new URL(requestUrl);
  url.pathname = DIRECTORY_PATH;
  // `name` is this endpoint's only semantic query. Canonicalizing its case
  // gives every case-insensitive spelling one full-URL key that mutations can purge.
  url.search = "";
  url.searchParams.set("name", normalizedName);
  return new Request(url.toString(), { method: "GET" });
}

export async function readDirectoryCache(
  requestUrl: string,
  normalizedName: string,
): Promise<Response | null> {
  try {
    const response = await caches.default.match(
      createDirectoryCacheKey(requestUrl, normalizedName),
    );
    return response ?? null;
  } catch (error) {
    console.warn("NIP-05 cache read failed", error);
    return null;
  }
}

export function writeDirectoryCache(
  requestUrl: string,
  normalizedName: string,
  response: Response,
  executionContext: ExecutionContext,
): void {
  executionContext.waitUntil(
    caches.default
      .put(
        createDirectoryCacheKey(requestUrl, normalizedName),
        response.clone(),
      )
      .catch((error) => {
        console.warn("NIP-05 cache write failed", error);
      }),
  );
}

export async function purgeDirectoryCaches(
  requestUrl: string,
  names: Iterable<string>,
): Promise<void> {
  const uniqueNames = new Set(names);
  await Promise.all(
    Array.from(uniqueNames, async (name) => {
      try {
        await caches.default.delete(createDirectoryCacheKey(requestUrl, name));
      } catch (error) {
        console.warn("NIP-05 cache purge failed", { name, error });
      }
    }),
  );
}
