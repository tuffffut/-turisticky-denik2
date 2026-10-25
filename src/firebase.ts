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
/**
 * Saves a photo document directly to Firestore hike_photos collection.
 * Supports automatic chunking for high-resolution images so Firestore limits are never hit.
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
    const dataUrl = photoData.dataUrl;
    const CHUNK_SIZE = 700 * 1024;
    if (dataUrl.length <= CHUNK_SIZE) {
      await setDoc(doc(db, 'hike_photos', photoId), {
        id: photoId,
        hikeId: photoData.hikeId || '',
        dataUrl,
        name: photoData.name || 'foto.jpg',
        caption: photoData.caption || '',
        width: photoData.width || null,
        height: photoData.height || null,
        sizeKb: photoData.sizeKb || null,
        isChunked: false,
        createdAt: new Date().toISOString(),
      });
    } else {
      const totalChunks = Math.ceil(dataUrl.length / CHUNK_SIZE);
      await setDoc(doc(db, 'hike_photos', photoId), {
        id: photoId,
        hikeId: photoData.hikeId || '',
        dataUrlChunk0: dataUrl.substring(0, CHUNK_SIZE),
        totalChunks,
        isChunked: true,
        name: photoData.name || 'foto.jpg',
        caption: photoData.caption || '',
        width: photoData.width || null,
        height: photoData.height || null,
        sizeKb: photoData.sizeKb || null,
        createdAt: new Date().toISOString(),
      });
      for (let i = 1; i < totalChunks; i++) {
        const chunkStr = dataUrl.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await setDoc(doc(db, `hike_photos/${photoId}/chunks`, `chunk_${i}`), {
          chunkIndex: i,
          data: chunkStr,
        });
      }
    }
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
 * Reassembles chunked photos automatically if stored in parts.
 */
export async function fetchPhotoFromFirestore(photoId: string): Promise<string | null> {
  if (!photoId) return null;
  try {
    const snap = await getDoc(doc(db, 'hike_photos', photoId));
    if (snap.exists()) {
      const data = snap.data();
      if (!data) return null;
      if (data.isChunked) {
        let fullDataUrl = data.dataUrlChunk0 || '';
        const total = data.totalChunks || 1;
        for (let i = 1; i < total; i++) {
          const chunkSnap = await getDoc(doc(db, `hike_photos/${photoId}/chunks`, `chunk_${i}`));
          if (chunkSnap.exists()) {
            fullDataUrl += chunkSnap.data()?.data || '';
          }
        }
        return fullDataUrl || null;
      }
      return data.dataUrl || null;
    }
  } catch (err) {
    console.warn(`[Firestore] Nelze načíst fotografii ${photoId} z cloudu:`, err);
  }
  return null;
}

/**
 * Saves a hike document directly to Firestore from the browser (works on GitHub Pages and all devices).
 * Keeps the hike document lean by storing photo dataUrls in hike_photos, avoiding 1MB document limit.
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

    // Process photos: Back up full dataUrl into dedicated hike_photos document,
    // and keep ONLY lean metadata in hikes document (prevents 1MB document size limit error).
    if (Array.isArray(cleanData.photos)) {
      cleanData.photos = cleanData.photos.map((p: any) => {
        if (typeof p === 'object' && p !== null) {
          const photoId = p.id || 'photo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
          const item: any = {
            id: photoId,
            url: p.url && !p.url.startsWith('data:') ? p.url : `/api/photos/${photoId}`,
            rawUrl: p.rawUrl && !p.rawUrl.startsWith('data:') ? p.rawUrl : `/api/photos/${photoId}?raw=1`,
            name: p.name || 'foto.jpg',
            caption: p.caption || '',
            width: p.width || null,
            height: p.height || null,
            sizeKb: p.sizeKb || null,
            source: p.source || 'user',
            createdAt: p.createdAt || new Date().toISOString(),
          };

          if (p.dataUrl && typeof p.dataUrl === 'string' && p.dataUrl.startsWith('data:')) {
            // Save photo binary/dataUrl to dedicated hike_photos collection
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
          // Do NOT keep dataUrl inside cleanData.photos array to keep hike doc size < 15KB
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
 * Preserves lean document structure so document size never exceeds 1MB.
 */
export async function updateHikePhotosInFirestore(hikeId: string, photos: any[]): Promise<boolean> {
  if (!hikeId) return false;
  try {
    const cleanPhotos = (photos || []).map((p: any) => {
      if (typeof p === 'object' && p !== null) {
        const photoId = p.id || 'photo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const item: any = {
          id: photoId,
          url: p.url && !p.url.startsWith('data:') ? p.url : `/api/photos/${photoId}`,
          rawUrl: p.rawUrl && !p.rawUrl.startsWith('data:') ? p.rawUrl : `/api/photos/${photoId}?raw=1`,
          name: p.name || 'foto.jpg',
          caption: p.caption || '',
          width: p.width || null,
          height: p.height || null,
          sizeKb: p.sizeKb || null,
          source: p.source || 'user',
          createdAt: p.createdAt || new Date().toISOString(),
        };

        if (p.dataUrl && typeof p.dataUrl === 'string' && p.dataUrl.startsWith('data:')) {
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
        // Do NOT store dataUrl in the hike's photos array
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

export interface SecuritySettings {
  adminPin: string;
  readerPin: string;
  updatedAt?: string;
}

/**
 * Loads global security PINs (admin & reader) from Cloud Firestore.
 * Synchronizes instantly across all devices.
 */
export async function fetchSecuritySettings(): Promise<SecuritySettings> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'security'));
    if (snap.exists()) {
      const data = snap.data();
      const adminPin = (data?.adminPin && String(data.adminPin).trim()) || '0303';
      const readerPin = (data?.readerPin && String(data.readerPin).trim()) || (data?.pin && String(data.pin).trim()) || '1234';
      return {
        adminPin,
        readerPin,
        updatedAt: data?.updatedAt,
      };
    }
  } catch (err) {
    console.warn('[Firestore] Nelze načíst bezpečnostní nastavení:', err);
  }
  return { adminPin: '0303', readerPin: '1234' };
}

/**
 * Saves global security PINs (admin & reader) directly to Cloud Firestore.
 */
export async function saveSecuritySettings(settings: { adminPin: string; readerPin: string }): Promise<void> {
  try {
    await setDoc(
      doc(db, 'settings', 'security'),
      {
        adminPin: settings.adminPin.trim(),
        readerPin: settings.readerPin.trim(),
        pin: settings.readerPin.trim(), // backward compatibility
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err: any) {
    console.error('[Firestore] Nelze uložit globální hesla:', err);
    throw new Error(err?.message || 'Chyba při ukládání hesel do cloudové databáze');
  }
}
