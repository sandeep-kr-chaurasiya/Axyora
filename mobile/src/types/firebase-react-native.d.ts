declare module "firebase/auth" {
  // Minimal surface we actually use in the app. Types are intentionally
  // loose to avoid tight coupling to firebase's internal typings.

  export interface User {
    uid: string;
    email: string | null;
  }

  export function initializeAuth(app: unknown, options: { persistence: unknown }): any;

  export function getReactNativePersistence(storage: unknown): unknown;

  export function onAuthStateChanged(auth: any, cb: (user: User | null) => void): () => void;

  export function signInWithEmailAndPassword(
    auth: any,
    email: string,
    password: string
  ): Promise<{ user: User }>;

  export function createUserWithEmailAndPassword(
    auth: any,
    email: string,
    password: string
  ): Promise<{ user: User }>;

  export function signOut(auth: any): Promise<void>;
}
