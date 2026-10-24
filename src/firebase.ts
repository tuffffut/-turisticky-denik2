import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';

// Firebase configuration from firebase-applet-config.json
const firebaseConfig = {
  projectId: 'gen-lang-client-0010545625',
  appId: '1:97794798085:web:9fa67b94c8910224b7e26c',
  apiKey: 'AIzaSyDNS9uRFz78BykK1J1az3BPCGxemOOnN00',
  authDomain: 'gen-lang-client-0010545625.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-979ba053-1af7-4aca-8d37-c42a57fcba97',
  storageBucket: 'gen-lang-client-0010545625.firebasestorage.app',
  messagingSenderId: '97794798085',
};

export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

/**
 * Saves a photo document directly to Firestore hike_photos collection.
 * Works seamlessly across all devices, mobile browsers, and static hosts (GitHub Pages).
 */
export async function savePhotoToFirestore(
  photoId: string,
  photoData: {
    id: string;
    hikeId?: string;
    dataUrl: string;
    name?: string;
    caption?: string;
    width?: number | null;
    height?: number | null;
    sizeKb?: number | null;
  }
): Promise<void> {
  if (!photoId || !photoData.dataUrl) return;
  try {
    await setDoc(doc(db, 'hike_photos', photoId), {
      id: photoId,
      hikeId: photoData.hikeId || '',
      dataUrl: photoData.dataUrl,
      name: photoData.name || 'foto.jpg',
      caption: photoData.caption || '',
      width: photoData.width || null,
      height: photoData.height || null,
      sizeKb: photoData.sizeKb || null,
      createdAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Firestore] Chyba při ukládání fotografie do cloudu:', err);
    let msg = err?.message || 'Chyba při zápisu fotografie do databáze';
    if (/quota/i.test(msg)) {
      msg = 'Byl překročen denní limit cloudové databáze (Firestore Quota Exceeded). Fotografie nemohla být uložena.';
    }
    throw new Error(msg);
  }
}

/**
 * Fetches a photo dataUrl directly from Firestore hike_photos by photoId.
 */
export async function fetchPhotoFromFirestore(photoId: string): Promise<string | null> {
  if (!photoId) return null;
  try {
    const snap = await getDoc(doc(db, 'hike_photos', photoId));
    if (snap.exists()) {
      const data = snap.data();
      return data?.dataUrl || null;
    }
  } catch (err) {
    console.warn(`[Firestore] Nelze načíst fotografii ${photoId} z cloudu:`, err);
  }
  return null;
}

/**
 * Saves a hike document directly to Firestore from the browser (works on GitHub Pages and all devices).
 */
export async function syncHikeToFirestore(hikeId: string, hikeData: any): Promise<boolean> {
  if (!hikeId || !hikeData) return false;
  try {
    const cleanData: Record<string, any> = {};
    for (const [k, v] of Object.entries(hikeData)) {
      if (v !== undefined) cleanData[k] = v;
    }

    // Strip large raw XML to never exceed Firestore 1MB document limit
    delete cleanData.gpxRawXml;
    delete cleanData.trackPoints;

    // Guard against Firestore 1MB document limit: sample trackpoints to max 300 points
    if (Array.isArray(cleanData.trackpoints) && cleanData.trackpoints.length > 300) {
      const step = Math.ceil(cleanData.trackpoints.length / 300);
      cleanData.trackpoints = cleanData.trackpoints.filter((_: any, i: number) => i % step === 0 || i === cleanData.trackpoints.length - 1);
    }

    // Process and preserve photos with their optimized dataUrls (up to ~350KB per photo)
    // Also backs up each individual photo into hike_photos collection
    if (Array.isArray(cleanData.photos)) {
      cleanData.photos = cleanData.photos.map((p: any) => {
        if (typeof p === 'object' && p !== null) {
          const photoId = p.id || 'photo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
          const item: any = {
            id: photoId,
            url: p.url || `/api/photos/${photoId}`,
            rawUrl: p.rawUrl || `/api/photos/${photoId}?raw=1`,
            name: p.name || 'foto.jpg',
            caption: p.caption || '',
            width: p.width || null,
            height: p.height || null,
            sizeKb: p.sizeKb || null,
          };
          if (p.dataUrl && typeof p.dataUrl === 'string') {
            item.dataUrl = p.dataUrl;
            // Back up photo to dedicated hike_photos document asynchronously
            savePhotoToFirestore(photoId, {
              id: photoId,
              hikeId,
              dataUrl: p.dataUrl,
              name: p.name,
              caption: p.caption,
              width: p.width,
              height: p.height,
              sizeKb: p.sizeKb,
            }).catch(() => {});
          }
          return item;
        }
        return p;
      });
    }

    await setDoc(doc(db, 'hikes', hikeId), cleanData, { merge: true });
    return true;
  } catch (err: any) {
    console.error('[Firestore] Chyba při ukládání do cloudu:', err);
    let msg = err?.message || 'Chyba při zápisu do cloudové databáze';
    if (/quota/i.test(msg)) {
      msg = 'Byl překročen denní limit cloudové databáze (Firestore Quota Exceeded). Data nelze uložit na cloud.';
    }
    throw new Error(msg);
  }
}

/**
 * Updates the photos array of a hike directly in Firestore (synchronizes all devices).
 */
export async function updateHikePhotosInFirestore(hikeId: string, photos: any[]): Promise<boolean> {
  if (!hikeId) return false;
  try {
    const cleanPhotos = (photos || []).map((p: any) => {
      if (typeof p === 'object' && p !== null) {
        const photoId = p.id || 'photo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const item: any = {
          id: photoId,
          url: p.url || `/api/photos/${photoId}`,
          rawUrl: p.rawUrl || `/api/photos/${photoId}?raw=1`,
          name: p.name || 'foto.jpg',
          caption: p.caption || '',
          width: p.width || null,
          height: p.height || null,
          sizeKb: p.sizeKb || null,
        };
        if (p.dataUrl && typeof p.dataUrl === 'string') {
          item.dataUrl = p.dataUrl;
          savePhotoToFirestore(photoId, {
            id: photoId,
            hikeId,
            dataUrl: p.dataUrl,
            name: p.name,
            caption: p.caption,
            width: p.width,
            height: p.height,
            sizeKb: p.sizeKb,
          }).catch(() => {});
        }
        return item;
      }
      return p;
    });

    await setDoc(doc(db, 'hikes', hikeId), { photos: cleanPhotos }, { merge: true });
    return true;
  } catch (err: any) {
    console.error('[Firestore] Nelze aktualizovat fotky v cloudu:', err);
    let msg = err?.message || 'Chyba při aktualizaci fotek na cloudu';
    if (/quota/i.test(msg)) {
      msg = 'Byl překročen denní limit cloudové databáze (Firestore Quota Exceeded). Fotky nelze uložit.';
    }
    throw new Error(msg);
  }
}

/**
 * Permanently deletes a photo document from Firestore cloud storage.
 */
export async function deletePhotoFromFirestore(photoId: string): Promise<boolean> {
  if (!photoId) return false;
  try {
    await deleteDoc(doc(db, 'hike_photos', photoId));
    return true;
  } catch (err: any) {
    return false;
  }
}

/**
 * Deletes a hike document directly from Firestore.
 */
export async function deleteHikeFromFirestore(hikeId: string): Promise<boolean> {
  if (!hikeId) return false;
  try {
    await deleteDoc(doc(db, 'hikes', hikeId));
    return true;
  } catch (err: any) {
    console.warn('[Firestore] Nelze smazat výpravu z cloudu:', err?.message);
    return false;
  }
}

/**
 * Loads all hikes from Firestore to merge with static cache.
 */
export async function fetchHikesFromFirestore(): Promise<any[]> {
  try {
    const snap = await getDocs(collection(db, 'hikes'));
    const list: any[] = [];
    snap.forEach((d) => {
      list.push({ ...d.data(), id: d.id });
    });
    return list;
  } catch (err: any) {
    console.warn('[Firestore] Nelze načíst z cloudu (bude použit lokální soubor):', err?.message);
    return [];
  }
}
