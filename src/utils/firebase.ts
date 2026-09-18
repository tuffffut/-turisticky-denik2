import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { MountainHike, PinConfig } from '../types';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

const HIKES_COLLECTION = 'hikes';
const CONFIG_COLLECTION = 'app_config';
const SECURITY_DOC_ID = 'security';

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
          hikes.push(docSnap.data() as MountainHike);
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
 * Saves or updates a single hike document in Firestore.
 */
export async function saveHikeToFirestore(hike: MountainHike): Promise<void> {
  const docRef = doc(db, HIKES_COLLECTION, hike.id);
  // Clean undefined values to prevent Firestore error
  const cleanData = JSON.parse(JSON.stringify(hike));
  await setDoc(docRef, cleanData);
}

/**
 * Deletes a hike document from Firestore.
 */
export async function deleteHikeFromFirestore(hikeId: string): Promise<void> {
  const docRef = doc(db, HIKES_COLLECTION, hikeId);
  await deleteDoc(docRef);
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
