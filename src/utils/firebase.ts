import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { MountainHike, PinConfig } from '../types';
import { parseGPX } from './gpxParser';
import { parseValidDate } from './dateUtils';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

const HIKES_COLLECTION = 'hikes';
const CONFIG_COLLECTION = 'app_config';
const SECURITY_DOC_ID = 'security';

function hydrateHikeWithGPX(hike: MountainHike): MountainHike {
  if ((!hike.trackPoints || hike.trackPoints.length === 0) && hike.gpxRawXml) {
    try {
      const parsed = parseGPX(hike.gpxRawXml);
      hike.trackPoints = parsed.trackPoints;
      if (!hike.peakCoords?.lat && parsed.trackPoints.length > 0) {
        let highest = parsed.trackPoints[0];
        parsed.trackPoints.forEach((p) => {
          if ((p.ele ?? 0) > (highest.ele ?? 0)) highest = p;
        });
        hike.peakCoords = { lat: highest.lat, lng: highest.lng, name: hike.title };
      }
      if (!hike.highestPointM && parsed.maxElevationM) {
        hike.highestPointM = parsed.maxElevationM;
      }
      if (!hike.movingDuration && parsed.movingDuration) {
        hike.movingDuration = parsed.movingDuration;
      }
    } catch (e) {
      console.warn('Nelze naparsovat gpxRawXml pro trasu:', hike.id, e);
    }
  }
  return hike;
}

/**
 * Subscribes to real-time updates from Firestore hikes collection.
 */
export function subscribeToHikes(
  onUpdate: (hikes: MountainHike[]) => void,
  onError?: (error: Error) => void
): () => void {
  try {
    const colRef = collection(db, HIKES_COLLECTION);
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const hikes: MountainHike[] = [];
        snapshot.forEach((docSnap) => {
          const raw = docSnap.data() as any;
          const hikeId = (raw.id && String(raw.id).trim()) || docSnap.id;

          // If document is marked as test or has no meaningful data, skip or sanitize
          if (raw.test === true && !raw.title && !raw.distanceKm) {
            // Self-healing: if an orphan test-doc exists, delete it
            deleteDoc(docSnap.ref).catch(() => {});
            return;
          }

          const cleanTitle = (raw.title && String(raw.title).trim()) || 'Aktivita v terénu';
          let cleanPhotos = Array.isArray(raw.photos) ? raw.photos : [];
          // Strip stock Unsplash placeholder photo from Garmin activities so it's clean for user photos
          cleanPhotos = cleanPhotos.filter((url: any) => {
            if (typeof url !== 'string' || !url.trim()) return false;
            if (hikeId.startsWith('garmin') && url.includes('1464822759023')) return false;
            return true;
          });

          const cleanHike: MountainHike = {
            id: hikeId,
            title: cleanTitle,
            mountainRange: (raw.mountainRange && String(raw.mountainRange).trim()) || 'Aktivita v terénu',
            date: parseValidDate(raw.date || raw.time || raw.createdAt),
            distanceKm: typeof raw.distanceKm === 'number' && !isNaN(raw.distanceKm) ? raw.distanceKm : 0,
            elevationGainM: typeof raw.elevationGainM === 'number' && !isNaN(raw.elevationGainM) ? raw.elevationGainM : 0,
            elevationLossM: typeof raw.elevationLossM === 'number' && !isNaN(raw.elevationLossM) ? raw.elevationLossM : 0,
            duration: (raw.duration && String(raw.duration).trim()) || '0m',
            movingDuration: (raw.movingDuration && String(raw.movingDuration).trim()) || undefined,
            difficulty: raw.difficulty || 'easy',
            rating: typeof raw.rating === 'number' && !isNaN(raw.rating) ? raw.rating : 5,
            description: raw.description || '',
            photos: cleanPhotos,
            videos: Array.isArray(raw.videos) ? raw.videos : [],
            highestPointM: raw.highestPointM,
            lowestPointM: raw.lowestPointM,
            peakCoords: raw.peakCoords || { lat: 50.736, lng: 15.74, name: cleanTitle },
            trackPoints: raw.trackPoints,
            gpxRawXml: raw.gpxRawXml,
            weather: raw.weather,
            hutsAndWaypoints: Array.isArray(raw.hutsAndWaypoints) ? raw.hutsAndWaypoints : undefined,
            aiSummary: raw.aiSummary,
          };

          hikes.push(hydrateHikeWithGPX(cleanHike));
        });
        onUpdate(hikes);
      },
      (err) => {
        console.warn('Firestore subscription error, falling back to local state:', err);
        if (onError) onError(err);
      }
    );
    return unsubscribe;
  } catch (err: any) {
    console.warn('Failed to subscribe to Firestore:', err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Sanitizes and optimizes a hike document so it never exceeds Firestore's 1MB limit
 * and localStorage quotas.
 */
export function sanitizeHikeForStorage(hike: MountainHike): MountainHike {
  const clean: MountainHike = { ...hike };

  // Downsample trackPoints to max 600 points if track is excessively long
  if (clean.trackPoints && clean.trackPoints.length > 600) {
    const total = clean.trackPoints.length;
    const step = Math.ceil(total / 600);
    const downsampled = [];
    for (let i = 0; i < total; i += step) {
      downsampled.push(clean.trackPoints[i]);
    }
    const last = clean.trackPoints[total - 1];
    if (downsampled[downsampled.length - 1] !== last) {
      downsampled.push(last);
    }
    clean.trackPoints = downsampled;
  }

  // If trackPoints are present, avoid saving giant duplicate GPX XML string (> 50KB)
  // because buildGPXXml dynamically reconstructs GPX for export/download anytime!
  if (clean.trackPoints && clean.trackPoints.length > 0 && clean.gpxRawXml && clean.gpxRawXml.length > 50000) {
    delete (clean as any).gpxRawXml;
  } else if (clean.gpxRawXml && clean.gpxRawXml.length > 350000) {
    delete (clean as any).gpxRawXml;
  }

  // Strip undefined and NaN values that could cause Firestore setDoc to fail
  const jsonStr = JSON.stringify(clean, (_key, value) => {
    if (typeof value === 'number' && isNaN(value)) {
      return null;
    }
    return value;
  });
  return JSON.parse(jsonStr);
}

/**
 * Saves or updates a single hike document in Firestore.
 */
export async function saveHikeToFirestore(hike: MountainHike): Promise<void> {
  const docRef = doc(db, HIKES_COLLECTION, hike.id);
  const cleanData = sanitizeHikeForStorage(hike);
  await setDoc(docRef, cleanData, { merge: true });
}

/**
 * Deletes a hike document from Firestore.
 */
export async function deleteHikeFromFirestore(hikeId: string): Promise<void> {
  if (!hikeId || !hikeId.trim()) return;
  const cleanId = hikeId.trim();
  let firestoreError: any = null;
  try {
    const docRef = doc(db, HIKES_COLLECTION, cleanId);
    await deleteDoc(docRef);
  } catch (err) {
    firestoreError = err;
    console.warn(`[Firestore client] Chyba při mazání trasy ${cleanId}:`, err);
  }

  // Also call server-side deletion endpoint as guaranteed sync
  try {
    const res = await fetch(`/api/routes/${encodeURIComponent(cleanId)}`, {
      method: 'DELETE',
    });
    if (!res.ok && firestoreError) {
      throw new Error(`Mazání selhalo na klientu i serveru: ${firestoreError?.message || res.statusText}`);
    }
  } catch (serverErr) {
    if (firestoreError) {
      throw firestoreError;
    }
  }
}

/**
 * Deletes all hikes from Firestore to leave the diary completely empty.
 */
export async function deleteAllHikesFromFirestore(): Promise<void> {
  try {
    const colRef = collection(db, HIKES_COLLECTION);
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (err) {
    console.warn('Chyba při mazání všech tras z Firestore:', err);
  }
}

/**
 * Fetches a single hike from Firestore by its ID.
 */
export async function getHikeFromFirestore(hikeId: string): Promise<MountainHike | null> {
  if (!hikeId || !hikeId.trim()) return null;
  try {
    const docRef = doc(db, HIKES_COLLECTION, hikeId.trim());
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const raw = snap.data() as any;
      const cleanHike: MountainHike = {
        ...raw,
        id: raw.id || snap.id,
        date: parseValidDate(raw.date || raw.time),
      };
      return hydrateHikeWithGPX(cleanHike);
    }
  } catch (err) {
    console.warn(`Chyba při načítání trasy ${hikeId} z Firestore:`, err);
  }
  return null;
}

/**
 * Seeds initial hikes if the Firestore collection is currently empty.
 */
export async function seedHikesIfEmpty(initialHikes: MountainHike[]): Promise<boolean> {
  try {
    const colRef = collection(db, HIKES_COLLECTION);
    const snapshot = await getDocs(colRef);
    if (snapshot.empty && initialHikes.length > 0) {
      const batch = writeBatch(db);
      initialHikes.forEach((hike) => {
        const docRef = doc(db, HIKES_COLLECTION, hike.id);
        const cleanData = JSON.parse(JSON.stringify(hike));
        batch.set(docRef, cleanData);
      });
      await batch.commit();
      return true;
    }
  } catch (err) {
    console.warn('Could not seed Firestore collection:', err);
  }
  return false;
}

/**
 * Subscribes to real-time updates for security PIN/password configuration in Firestore.
 */
export function subscribeToPins(
  onUpdate: (pins: PinConfig) => void,
  onError?: (error: Error) => void
): () => void {
  try {
    const docRef = doc(db, CONFIG_COLLECTION, SECURITY_DOC_ID);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data?.adminPin && data?.readerPin) {
            onUpdate({
              adminPin: String(data.adminPin).trim(),
              readerPin: String(data.readerPin).trim(),
            });
          }
        }
      },
      (err) => {
        console.warn('Firestore PIN subscription error:', err);
        if (onError) onError(err);
      }
    );
    return unsubscribe;
  } catch (err: any) {
    console.warn('Failed to subscribe to PINs in Firestore:', err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Saves updated PIN/password configuration to Firebase Firestore.
 */
export async function savePinsToFirestore(pins: PinConfig): Promise<void> {
  const docRef = doc(db, CONFIG_COLLECTION, SECURITY_DOC_ID);
  await setDoc(docRef, {
    adminPin: pins.adminPin.trim(),
    readerPin: pins.readerPin.trim(),
    updatedAt: new Date().toISOString(),
  });
}
