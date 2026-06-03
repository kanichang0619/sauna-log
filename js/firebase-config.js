/**
 * firebase-config.js - Firebase の初期化
 *
 * Firebase アプリを起動して Auth（認証）と Firestore（DB）の
 * インスタンスを作成します。他のファイルはここからインポートして使います。
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// Firebase Console から取得したプロジェクト設定
const firebaseConfig = {
  apiKey:            "AIzaSyDjWh8N5BZHuMkoFLWG_6OBvUvXzM2YxsI",
  authDomain:        "sauna-log-kanichang.firebaseapp.com",
  projectId:         "sauna-log-kanichang",
  storageBucket:     "sauna-log-kanichang.firebasestorage.app",
  messagingSenderId: "385624669141",
  appId:             "1:385624669141:web:5e3ed85f6b1be2a78b5b5c",
};

// Firebase アプリを初期化（1回だけ呼ぶ）
const app = initializeApp(firebaseConfig);

// 認証インスタンス（ログイン・ログアウトで使う）
export const auth = getAuth(app);

// Firestore インスタンス（データの読み書きで使う・フェーズ3で使用）
export const db = getFirestore(app);
