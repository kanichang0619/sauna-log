/**
 * auth.js - Google ログイン・ログアウト処理
 *
 * このファイルは type="module" として読み込まれます。
 *
 * ── ログイン方式について ─────────────────────────────────────
 * signInWithRedirect を使います。
 * firebase-config.js で indexedDBLocalPersistence を指定しているため、
 * iOS Safari がクロスオリジン遷移時に sessionStorage をクリアしても
 * リダイレクト中の認証情報が失われません。
 * ────────────────────────────────────────────────────────────
 */
import { auth } from "./firebase-config.js";
import {
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

// ---- DOM 要素の参照 ----
const loginBtn   = document.getElementById("login-btn");
const logoutBtn  = document.getElementById("logout-btn");
const userInfo   = document.getElementById("user-info");
const userAvatar = document.getElementById("user-avatar");
const userName   = document.getElementById("user-name");

// ============================================================
// リダイレクトログイン結果の処理
// ============================================================

async function processRedirectResult() {
  // フラグはエラー表示の判定にのみ使用する
  // getRedirectResult は毎回呼ぶことで Firebase の IndexedDB 内部状態をクリアする
  // （呼ばないと「リダイレクト進行中」状態が残り、2回目以降の signInWithRedirect が無言でスキップされる）
  const redirectPending = localStorage.getItem("saunaAuthRedirectPending");
  localStorage.removeItem("saunaAuthRedirectPending");

  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      console.log("[Auth] リダイレクトログイン成功:", result.user.email);
    }
  } catch (error) {
    console.error("[Auth] getRedirectResult エラー:", error.code, error.message);
    if (redirectPending) {
      alert(`ログインに失敗しました。\nエラー: ${error.code || "不明"}\n\nもう一度お試しください。`);
    }
  }
}

processRedirectResult();

// bfcache 復元時にも再実行
window.addEventListener("pageshow", (event) => {
  if (event.persisted) processRedirectResult();
});

// ============================================================
// ログイン処理
// ============================================================

async function handleLogin() {
  const provider = new GoogleAuthProvider();
  localStorage.setItem("saunaAuthRedirectPending", "1");
  try {
    await signInWithRedirect(auth, provider);
  } catch (error) {
    localStorage.removeItem("saunaAuthRedirectPending");
    console.error("[Auth] ログインエラー:", error.code, error.message);
    alert(`ログインに失敗しました。\nエラー: ${error.code || "不明"}\n\nもう一度お試しください。`);
  }
}

// ============================================================
// ログアウト処理
// ============================================================

async function handleLogout() {
  if (!confirm("ログアウトしますか？")) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error("[Auth] ログアウトエラー:", error);
    alert("ログアウトに失敗しました。");
  }
}

// ============================================================
// ログイン状態の監視
// ============================================================

onAuthStateChanged(auth, (user) => {
  if (user) {
    if (loginBtn)   loginBtn.classList.add("hidden");
    if (userInfo)   userInfo.classList.remove("hidden");
    if (userAvatar) {
      userAvatar.src = user.photoURL || "";
      userAvatar.alt = user.displayName || "ユーザー";
    }
    if (userName) {
      userName.textContent = user.displayName || user.email || "";
    }

    window.SaunaAuth = window.SaunaAuth || {};
    window.SaunaAuth.user = user;
    window.SaunaAuth.uid  = user.uid;

    window.dispatchEvent(new CustomEvent("sauna-auth-changed", { detail: { user } }));

  } else {
    if (loginBtn)  loginBtn.classList.remove("hidden");
    if (userInfo)  userInfo.classList.add("hidden");

    window.SaunaAuth = window.SaunaAuth || {};
    window.SaunaAuth.user = null;
    window.SaunaAuth.uid  = null;

    window.dispatchEvent(new CustomEvent("sauna-auth-changed", { detail: { user: null } }));
  }
});

// ============================================================
// イベントリスナーの登録
// ============================================================

if (loginBtn)  loginBtn.addEventListener("click",  handleLogin);
if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
