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
 * Saves a hike document directly to Firestore from the browser (works on GitHub Pages).
 */
export async function syncHikeToFirestore(hikeId: string, hikeData: any): Promise<boolean> {
  if (!hikeId || !hikeData) return false;
  try {
    const cleanData: Record<string, any> = {};
    for (const [k, v] of Object.entries(hikeData)) {
      if (v !== undefined) cleanData[k] = v;
    }

    // Guard against 1MB Firestore limit for trackpoints
    if (Array.isArray(cleanData.trackpoints) && cleanData.trackpoints.length > 800) {
      const step = Math.ceil(cleanData.trackpoints.length / 800);
      cleanData.trackpoints = cleanData.trackpoints.filter((_: any, i: number) => i % step === 0 || i === cleanData.trackpoints.length - 1);
      cleanData.trackPoints = cleanData.trackpoints;
    }

    // Strip huge base64 strings from hike document to avoid 1MB limit (photos are saved to IndexedDB & hike_photos)
    if (Array.isArray(cleanData.photos)) {
      cleanData.photos = cleanData.photos.map((p: any) => {
        if (typeof p === 'object' && p?.dataUrl) {
          const { dataUrl, ...rest } = p;
          return rest;
        }
        return p;
      });
    }

    await setDoc(doc(db, 'hikes', hikeId), cleanData, { merge: true });
    return true;
  } catch (err: any) {
    console.warn('[Firestore] Varování při ukládání do cloudu:', err?.message || err);
    return false;
  }
}

/**
 * Loads recent hikes from Firestore to merge with static cache.
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
