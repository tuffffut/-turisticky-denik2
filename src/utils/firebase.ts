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
          const raw = docSnap.data() as MountainHike;
          hikes.push(hydrateHikeWithGPX(raw));
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
  }

  // Strip undefined values
  return JSON.parse(JSON.stringify(clean));
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
  const docRef = doc(db, HIKES_COLLECTION, hikeId);
  await deleteDoc(docRef);
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
  try {
    const docRef = doc(db, HIKES_COLLECTION, hikeId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return hydrateHikeWithGPX(snap.data() as MountainHike);
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
