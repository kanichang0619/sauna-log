/**
 * auth.js - Google ログイン・ログアウト処理
 *
 * ページ上部のログインボタンを管理します。
 * ログイン状態に応じてボタンとユーザー情報の表示を切り替えます。
 * このファイルは type="module" として読み込まれます。
 */
import { auth } from "./firebase-config.js";

// ホーム画面から起動したPWA（iOS standalone）でDynamic Island/ノッチとの重なりを防ぐ
// CSSの env(safe-area-inset-top) が機能しない場合のJSフォールバック
if (window.navigator.standalone === true) {
  const el = document.documentElement;
  el.style.paddingTop = "env(safe-area-inset-top)";
  const safeTop = parseInt(getComputedStyle(el).paddingTop) || 0;
  el.style.paddingTop = "";
  const pad = Math.max(safeTop, 60); // Dynamic Island は約59px
  document.body.style.paddingTop = pad + "px";
}
import {
  GoogleAuthProvider,
  signInWithPopup,
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
// ログイン処理
// ============================================================

/**
 * 「Googleでログイン」ボタンを押したときの処理
 * ポップアップ画面で Google アカウントを選んで認証する
 */
async function handleLogin() {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
    // ログイン成功 → onAuthStateChanged が自動で呼ばれてUIが更新される
  } catch (error) {
    // ポップアップをキャンセルした場合は無視する
    if (
      error.code === "auth/popup-closed-by-user" ||
      error.code === "auth/cancelled-popup-request"
    ) {
      return;
    }
    console.error("ログインエラー:", error);
    alert("ログインに失敗しました。もう一度お試しください。");
  }
}

// ============================================================
// ログアウト処理
// ============================================================

/**
 * 「ログアウト」ボタンを押したときの処理
 */
async function handleLogout() {
  if (!confirm("ログアウトしますか？")) return;
  try {
    await signOut(auth);
    // ログアウト成功 → onAuthStateChanged が自動で呼ばれてUIが更新される
  } catch (error) {
    console.error("ログアウトエラー:", error);
    alert("ログアウトに失敗しました。");
  }
}

// ============================================================
// ログイン状態の監視
// ============================================================

/**
 * ログイン状態の変化を監視する
 * ページを開いたとき・ログイン・ログアウト時に自動で呼ばれる
 * @param {object|null} user - ログイン中のユーザー情報（未ログインなら null）
 */
onAuthStateChanged(auth, (user) => {
  if (user) {
    // ---- ログイン済み ----
    if (loginBtn)   loginBtn.classList.add("hidden");
    if (userInfo)   userInfo.classList.remove("hidden");
    if (userAvatar) {
      userAvatar.src = user.photoURL || "";
      userAvatar.alt = user.displayName || "ユーザー";
    }
    if (userName) {
      userName.textContent = user.displayName || user.email || "";
    }

    // 他のスクリプト（cloud-storage.js など）からアクセスできるよう公開
    window.SaunaAuth = window.SaunaAuth || {};
    window.SaunaAuth.user = user;
    window.SaunaAuth.uid  = user.uid;

    // cloud-storage.js に「ログインした」ことを通知する
    window.dispatchEvent(new CustomEvent("sauna-auth-changed", { detail: { user } }));

  } else {
    // ---- 未ログイン ----
    if (loginBtn)  loginBtn.classList.remove("hidden");
    if (userInfo)  userInfo.classList.add("hidden");

    window.SaunaAuth = window.SaunaAuth || {};
    window.SaunaAuth.user = null;
    window.SaunaAuth.uid  = null;

    // cloud-storage.js に「ログアウトした」ことを通知する
    window.dispatchEvent(new CustomEvent("sauna-auth-changed", { detail: { user: null } }));
  }
});

// ============================================================
// イベントリスナーの登録
// ============================================================

if (loginBtn)  loginBtn.addEventListener("click",  handleLogin);
if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
