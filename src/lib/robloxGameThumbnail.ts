interface RobloxPlaceGameIconResponse {
  data?: {
    targetId: number;
    state: string;
    imageUrl: string | null;
  }[];
}

const thumbnailCache = new Map<number, string | null>();
const inflight = new Map<number, Promise<string | null>>();

export async function getRobloxGameThumbnail(placeId: number): Promise<string | null> {
  if (!Number.isInteger(placeId) || placeId <= 0) {
    return null;
  }

  if (thumbnailCache.has(placeId)) {
    return thumbnailCache.get(placeId) ?? null;
  }

  const existing = inflight.get(placeId);
  if (existing) {
    return existing;
  }

  const request = (async () => {
    try {
      const response = await fetch(
        `https://thumbnails.roblox.com/v1/places/gameicons?placeIds=${placeId}&size=512x512&format=Png&isCircular=false`
      );

      if (!response.ok) {
        thumbnailCache.set(placeId, null);
        return null;
      }

      const payload = (await response.json()) as RobloxPlaceGameIconResponse;
      const imageUrl = payload.data?.[0]?.state === 'Completed'
        ? payload.data?.[0]?.imageUrl ?? null
        : null;

      thumbnailCache.set(placeId, imageUrl);
      return imageUrl;
    } catch {
      thumbnailCache.set(placeId, null);
      return null;
    } finally {
      inflight.delete(placeId);
    }
  })();

  inflight.set(placeId, request);
  return request;
}
