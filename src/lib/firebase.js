import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyASiZxXlk52H03rfFy147eob52cGO81QFM",
  authDomain: "tanle-dev.firebaseapp.com",
  projectId: "tanle-dev",
  storageBucket: "tanle-dev.firebasestorage.app",
  messagingSenderId: "1010177787437",
  appId: "1:1010177787437:web:c2a6994effe0cdb8de9aa4",
  measurementId: "G-NYGL0JJCTF"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
