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
import { MountainHike, PinConfig, GPXTrackPoint } from '../types';
import { parseGPX } from './gpxParser';
import { parseValidDate } from './dateUtils';
import {
  detectMountainRangeFromCoords,
  detectMountainRangeFromTitle,
  isSuspectMountainRange,
} from './mountainRanges';

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

  // Always derive highestPointM and lowestPointM from trackPoints if missing
  if (!hike.highestPointM && hike.trackPoints && hike.trackPoints.length > 0) {
    const validEles = hike.trackPoints.map((p) => p.ele).filter((e): e is number => typeof e === 'number' && e > 0);
    if (validEles.length > 0) {
      hike.highestPointM = Math.round(Math.max(...validEles));
    }
  }
  if (!hike.lowestPointM && hike.trackPoints && hike.trackPoints.length > 0) {
    const validEles = hike.trackPoints.map((p) => p.ele).filter((e): e is number => typeof e === 'number' && e > 0);
    if (validEles.length > 0) {
      hike.lowestPointM = Math.round(Math.min(...validEles));
    }
  }

  // Ensure mountainRange is accurate and not generic České hory
  if (
    !hike.mountainRange ||
    hike.mountainRange === 'Aktivita v terénu' ||
    hike.mountainRange.toLowerCase() === 'české hory' ||
    hike.mountainRange.toLowerCase() === 'ceske hory'
  ) {
    const pLat = hike.peakCoords?.lat || hike.trackPoints?.[0]?.lat;
    const pLng = hike.peakCoords?.lng || hike.trackPoints?.[0]?.lng;
    let detected: string | undefined = undefined;
    if (pLat && pLng) {
      detected = detectMountainRangeFromCoords(pLat, pLng);
    }
    if (!detected || detected === 'Aktivita v terénu' || detected === 'Česká republika (výlet)') {
      const fromTitle = detectMountainRangeFromTitle(hike.title);
      if (fromTitle) detected = fromTitle;
    }
    hike.mountainRange = detected || 'Česká republika (výlet)';
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

          const cleanTitle =
            (raw.title && String(raw.title).trim()) ||
            (raw.name && String(raw.name).trim()) ||
            (raw.activityName && String(raw.activityName).trim()) ||
            'Aktivita v terénu';

          let cleanPhotos = Array.isArray(raw.photos) ? raw.photos : [];
          // Strip stock Unsplash placeholder photo from Garmin activities so it's clean for user photos
          cleanPhotos = cleanPhotos.filter((url: any) => {
            if (typeof url !== 'string' || !url.trim()) return false;
            if (hikeId.startsWith('garmin') && url.includes('1464822759023')) return false;
            return true;
          });

          // Normalize trackPoints: ensure lat, lng, ele, distFromStartKm exist
          let cleanTrackPoints: GPXTrackPoint[] | undefined = undefined;
          if (Array.isArray(raw.trackPoints) && raw.trackPoints.length > 0) {
            cleanTrackPoints = raw.trackPoints.map((pt: any) => ({
              lat: Number(pt.lat) || 0,
              lng: Number(pt.lng ?? pt.lon) || 0,
              ele: typeof pt.ele === 'number' ? pt.ele : typeof pt.elevationM === 'number' ? pt.elevationM : undefined,
              distFromStartKm:
                typeof pt.distFromStartKm === 'number'
                  ? pt.distFromStartKm
                  : typeof pt.distanceKm === 'number'
                  ? pt.distanceKm
                  : undefined,
              time: pt.time,
            }));
          }

          // Mountain range resolution
          let cleanRange = (raw.mountainRange && String(raw.mountainRange).trim()) || '';
          const pLat = raw.peakCoords?.lat || raw.startPoint?.lat || cleanTrackPoints?.[0]?.lat;
          const pLng =
            raw.peakCoords?.lng ||
            raw.peakCoords?.lon ||
            raw.startPoint?.lon ||
            raw.startPoint?.lng ||
            cleanTrackPoints?.[0]?.lng;

          const isGenericOrSuspect =
            !cleanRange ||
            cleanRange === 'Aktivita v terénu' ||
            cleanRange.toLowerCase() === 'české hory' ||
            cleanRange.toLowerCase() === 'ceske hory' ||
            cleanRange.toLowerCase() === 'zahraničí' ||
            isSuspectMountainRange(cleanRange, pLat, pLng);

          if (isGenericOrSuspect) {
            let detected: string | undefined = undefined;
            if (pLat && pLng) {
              detected = detectMountainRangeFromCoords(pLat, pLng);
            }
            if (!detected || detected === 'Aktivita v terénu' || detected === 'Česká republika (výlet)') {
              const fromTitle = detectMountainRangeFromTitle(cleanTitle);
              if (fromTitle) detected = fromTitle;
            }
            if (detected && detected !== 'Aktivita v terénu') {
              cleanRange = detected;
            } else {
              cleanRange = detectMountainRangeFromTitle(cleanTitle) || 'Česká republika (výlet)';
            }

            // Self-heal document in Firestore if it was stored with generic 'České hory'
            if (
              raw.mountainRange &&
              (raw.mountainRange.toLowerCase() === 'české hory' || raw.mountainRange.toLowerCase() === 'ceske hory') &&
              cleanRange &&
              cleanRange !== raw.mountainRange
            ) {
              setDoc(docSnap.ref, { mountainRange: cleanRange }, { merge: true }).catch(() => {});
            }
          }

          // Elevation extremes fallback
          let highestPointM: number | undefined = undefined;
          if (typeof raw.highestPointM === 'number' && !isNaN(raw.highestPointM)) {
            highestPointM = raw.highestPointM;
          } else if (raw.highestPointM) {
            const p = parseFloat(String(raw.highestPointM).replace(/[^\d.-]/g, ''));
            if (!isNaN(p) && p > 0) highestPointM = Math.round(p);
          }

          let lowestPointM: number | undefined = undefined;
          if (typeof raw.lowestPointM === 'number' && !isNaN(raw.lowestPointM)) {
            lowestPointM = raw.lowestPointM;
          } else if (raw.lowestPointM) {
            const p = parseFloat(String(raw.lowestPointM).replace(/[^\d.-]/g, ''));
            if (!isNaN(p) && p > 0) lowestPointM = Math.round(p);
          }

          if (!highestPointM && cleanTrackPoints && cleanTrackPoints.length > 0) {
            const eles = cleanTrackPoints
              .map((p) => p.ele)
              .filter((e): e is number => typeof e === 'number' && e > 0);
            if (eles.length > 0) {
              highestPointM = Math.round(Math.max(...eles));
            }
          }
          if (!highestPointM && raw.peakCoords?.name) {
            const m = /(\d{3,4})\s*(?:m|m\s*n\.?\s*m\.?)?/i.exec(raw.peakCoords.name);
            if (m) highestPointM = parseInt(m[1], 10);
          }
          if (!highestPointM && cleanTitle) {
            const m = /(\d{3,4})\s*(?:m|m\s*n\.?\s*m\.?)?/i.exec(cleanTitle);
            if (m) highestPointM = parseInt(m[1], 10);
          }
          if (!highestPointM && raw.elevationGainM && Number(raw.elevationGainM) > 0) {
            highestPointM = Math.round(Number(raw.elevationGainM));
          }
          if (!lowestPointM && cleanTrackPoints && cleanTrackPoints.length > 0) {
            const eles = cleanTrackPoints
              .map((p) => p.ele)
              .filter((e): e is number => typeof e === 'number' && e > 0);
            if (eles.length > 0) {
              lowestPointM = Math.round(Math.min(...eles));
            }
          }

          const cleanHike: MountainHike = {
            id: hikeId,
            title: cleanTitle,
            mountainRange: cleanRange,
            activityType: raw.activityType || undefined,
            date: parseValidDate(raw.date || raw.time || raw.createdAt),
            distanceKm: typeof raw.distanceKm === 'number' && !isNaN(raw.distanceKm) ? raw.distanceKm : 0,
            elevationGainM: typeof raw.elevationGainM === 'number' && !isNaN(raw.elevationGainM) ? raw.elevationGainM : 0,
            elevationLossM: typeof raw.elevationLossM === 'number' && !isNaN(raw.elevationLossM) ? raw.elevationLossM : 0,
            duration: (raw.duration && String(raw.duration).trim()) || '0m',
            movingDuration: (raw.movingDuration && String(raw.movingDuration).trim()) || undefined,
            difficulty: raw.difficulty || undefined,
            rating: typeof raw.rating === 'number' && !isNaN(raw.rating) && raw.rating > 0 ? raw.rating : undefined,
            description: raw.description || '',
            photos: cleanPhotos,
            videos: Array.isArray(raw.videos) ? raw.videos : [],
            highestPointM: highestPointM,
            lowestPointM: lowestPointM,
            peakCoords: raw.peakCoords || {
              lat: cleanTrackPoints?.[0]?.lat || 50.736,
              lng: cleanTrackPoints?.[0]?.lng || 15.74,
              name: cleanTitle,
            },
            trackPoints: cleanTrackPoints,
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

  // Downsample trackPoints to max 500 points if track is excessively long
  if (clean.trackPoints && clean.trackPoints.length > 500) {
    const total = clean.trackPoints.length;
    const step = Math.ceil(total / 500);
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

  // If trackPoints are present, avoid saving giant duplicate GPX XML string (> 30KB)
  // because buildGPXXml dynamically reconstructs GPX for export/download anytime!
  if (clean.trackPoints && clean.trackPoints.length > 0 && clean.gpxRawXml) {
    delete (clean as any).gpxRawXml;
  } else if (clean.gpxRawXml && clean.gpxRawXml.length > 250000) {
    delete (clean as any).gpxRawXml;
  }

  // Strip undefined and NaN values that could cause Firestore setDoc to fail
  let jsonStr = JSON.stringify(clean, (_key, value) => {
    if (typeof value === 'number' && isNaN(value)) {
      return null;
    }
    return value;
  });

  // Strict Firestore 1,048,576 bytes threshold guard
  // If JSON is approaching 850KB, downsample points even further
  if (jsonStr.length > 850000 && clean.trackPoints && clean.trackPoints.length > 200) {
    const total = clean.trackPoints.length;
    const step = Math.ceil(total / 200);
    const compact: GPXTrackPoint[] = [];
    for (let i = 0; i < total; i += step) {
      compact.push(clean.trackPoints[i]);
    }
    clean.trackPoints = compact;
    jsonStr = JSON.stringify(clean);
  }

  // If still above 880KB, trim excess photos to prevent Firestore document failure
  if (jsonStr.length > 880000 && clean.photos && clean.photos.length > 10) {
    while (jsonStr.length > 880000 && clean.photos.length > 10) {
      clean.photos.pop();
      jsonStr = JSON.stringify(clean);
    }
  }

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
 * Saves a list of hikes into Firestore in optimized batches.
 */
export async function saveHikesBatchToFirestore(
  hikes: MountainHike[],
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  let savedCount = 0;
  const chunkSize = 40;
  for (let i = 0; i < hikes.length; i += chunkSize) {
    const chunk = hikes.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    for (const rawHike of chunk) {
      const hydrated = hydrateHikeWithGPX(rawHike);
      const cleanData = sanitizeHikeForStorage(hydrated);
      const docRef = doc(db, HIKES_COLLECTION, cleanData.id);
      batch.set(docRef, cleanData, { merge: true });
    }
    await batch.commit();
    savedCount += chunk.length;
    if (onProgress) {
      onProgress(savedCount, hikes.length);
    }
  }
  return savedCount;
}

/**
 * Fetches a single hike from Firestore by its ID (supports hikes and mountain_hikes collections, and hyphen/underscore variants).
 */
export async function getHikeFromFirestore(hikeId: string): Promise<MountainHike | null> {
  if (!hikeId || !hikeId.trim()) return null;
  const rawId = hikeId.trim();
  const candidateIds = Array.from(
    new Set([
      rawId,
      rawId.replace(/_/g, '-'),
      rawId.replace(/-/g, '_'),
      rawId.startsWith('garmin') ? rawId : `garmin-${rawId}`,
      rawId.startsWith('garmin') ? rawId : `garmin_${rawId}`,
    ])
  );

  const candidateCollections = [HIKES_COLLECTION, 'mountain_hikes'];

  for (const col of candidateCollections) {
    for (const candId of candidateIds) {
      try {
        const docRef = doc(db, col, candId);
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
        // Continue trying next candidate
      }
    }
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
 * Resets all hikes in Firestore by clearing the collection and inserting the provided default hikes.
 */
export async function resetAllHikesInFirestore(defaultHikes: MountainHike[]): Promise<boolean> {
  try {
    const colRef = collection(db, HIKES_COLLECTION);
    const snapshot = await getDocs(colRef);
    const batch = writeBatch(db);
    snapshot.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    defaultHikes.forEach((hike) => {
      const docRef = doc(db, HIKES_COLLECTION, hike.id);
      const cleanData = JSON.parse(JSON.stringify(hike));
      batch.set(docRef, cleanData);
    });
    await batch.commit();
    return true;
  } catch (err) {
    console.warn('Could not reset Firestore hikes collection:', err);
    return false;
  }
}

/**
 * Repairs missing fields (title, mountainRange, trackPoints format) on existing hikes in Firestore.
 */
export async function repairAllHikesInFirestore(): Promise<number> {
  try {
    const colRef = collection(db, HIKES_COLLECTION);
    const snapshot = await getDocs(colRef);
    const batch = writeBatch(db);
    let count = 0;

    snapshot.forEach((docSnap) => {
      const raw = docSnap.data() as any;
      let needsUpdate = false;
      const updates: Record<string, any> = {};

      if (!raw.title && (raw.name || raw.activityName)) {
        updates.title = raw.name || raw.activityName;
        needsUpdate = true;
      }

      if (!raw.mountainRange || raw.mountainRange === 'Aktivita v terénu') {
        const pLat =
          raw.peakCoords?.lat ||
          raw.startPoint?.lat ||
          (Array.isArray(raw.trackPoints) && raw.trackPoints[0]?.lat);
        const pLng =
          raw.peakCoords?.lng ||
          raw.peakCoords?.lon ||
          raw.startPoint?.lon ||
          raw.startPoint?.lng ||
          (Array.isArray(raw.trackPoints) && (raw.trackPoints[0]?.lng ?? raw.trackPoints[0]?.lon));
        if (pLat && pLng) {
          updates.mountainRange = detectMountainRangeFromCoords(pLat, pLng);
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        batch.set(docSnap.ref, updates, { merge: true });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
    }
    return count;
  } catch (err) {
    console.warn('Could not repair Firestore hikes:', err);
    return 0;
  }
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
