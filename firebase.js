// Firebase initialization and exports (modular SDK v9+)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBGxRY2Ps4BBI_fs3f_DmLzy2rLeny3KUs",
  authDomain: "bodegahumorstock.firebaseapp.com",
  projectId: "bodegahumorstock",
  storageBucket: "bodegahumorstock.firebasestorage.app",
  messagingSenderId: "714581108605",
  appId: "1:714581108605:web:5575163867f2732a9ace14",
  measurementId: "G-C3Z4615X83"
};

// Initialize app
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// export database reference
export { db };