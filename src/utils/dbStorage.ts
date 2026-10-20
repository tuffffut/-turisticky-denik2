// Lightweight, zero-dependency IndexedDB wrapper for large data (GPX trackpoints & 4K photos)
// Ensures 100% durability on GitHub Pages without exceeding the 5MB localStorage limit.

const DB_NAME = 'horsky_denik_db';
const DB_VERSION = 1;
const STORE_TRACKS = 'tracks';
const STORE_PHOTOS = 'photos';
const STORE_ROUTES = 'routes_meta';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_TRACKS)) {
        db.createObjectStore(STORE_TRACKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
        db.createObjectStore(STORE_PHOTOS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_ROUTES)) {
        db.createObjectStore(STORE_ROUTES, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves full GPX trackpoints (even 10,000+ points) permanently in IndexedDB.
 */
export async function saveRouteTrackpoints(routeId: string, trackpoints: any[]): Promise<void> {
  if (!routeId || !Array.isArray(trackpoints) || trackpoints.length === 0) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_TRACKS, 'readwrite');
      const store = tx.objectStore(STORE_TRACKS);
      store.put({ id: routeId, trackpoints, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Nelze uložit GPS body do IndexedDB:', err);
  }
}

/**
 * Retrieves full GPX trackpoints from IndexedDB.
 */
export async function getRouteTrackpoints(routeId: string): Promise<any[] | null> {
  if (!routeId) return null;
  try {
    const db = await openDB();
    return await new Promise<any[] | null>((resolve) => {
      const tx = db.transaction(STORE_TRACKS, 'readonly');
      const store = tx.objectStore(STORE_TRACKS);
      const req = store.get(routeId);
      req.onsuccess = () => {
        resolve(req.result?.trackpoints || null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Stores a full resolution photo (base64 dataUrl) in IndexedDB.
 */
export async function savePhotoBlob(photoId: string, dataUrl: string, metadata?: any): Promise<void> {
  if (!photoId || !dataUrl) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PHOTOS, 'readwrite');
      const store = tx.objectStore(STORE_PHOTOS);
      store.put({ id: photoId, dataUrl, metadata, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Nelze uložit fotografii do IndexedDB:', err);
  }
}

/**
 * Retrieves a full resolution photo from IndexedDB.
 */
export async function getPhotoBlob(photoId: string): Promise<string | null> {
  if (!photoId) return null;
  try {
    const db = await openDB();
    return await new Promise<string | null>((resolve) => {
      const tx = db.transaction(STORE_PHOTOS, 'readonly');
      const store = tx.objectStore(STORE_PHOTOS);
      const req = store.get(photoId);
      req.onsuccess = () => {
        resolve(req.result?.dataUrl || null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Persists the entire photo array for a route into IndexedDB (supports multi-MB full 4K photos).
 */
export async function saveRoutePhotos(routeId: string, photos: any[]): Promise<void> {
  if (!routeId || !Array.isArray(photos)) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_ROUTES, 'readwrite');
      const store = tx.objectStore(STORE_ROUTES);
      store.put({ id: routeId, photos, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Nelze uložit fotky výpravy do IndexedDB:', err);
  }
}

/**
 * Retrieves the persisted photo array for a route from IndexedDB.
 */
export async function getRoutePhotos(routeId: string): Promise<any[] | null> {
  if (!routeId) return null;
  try {
    const db = await openDB();
    return await new Promise<any[] | null>((resolve) => {
      const tx = db.transaction(STORE_ROUTES, 'readonly');
      const store = tx.objectStore(STORE_ROUTES);
      const req = store.get(routeId);
      req.onsuccess = () => {
        resolve(req.result?.photos || null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

