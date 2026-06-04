/**
 * auth.js - Google ログイン・ログアウト処理
 *
 * ページ上部のログインボタンを管理します。
 * ログイン状態に応じてボタンとユーザー情報の表示を切り替えます。
 * このファイルは type="module" として読み込まれます。
 */
import { auth } from "./firebase-config.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

// iOS PWA（ホーム画面から起動）かどうか
const isStandalone =
  navigator.standalone === true ||
  window.matchMedia("(display-mode: standalone)").matches;

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
 * PWA スタンドアロンモード（iOS ホーム画面起動）ではリダイレクト方式を使う。
 * 通常のブラウザではポップアップ方式を使う。
 */
async function handleLogin() {
  const provider = new GoogleAuthProvider();
  try {
    if (isStandalone) {
      await signInWithRedirect(auth, provider);
      // リダイレクト後に Google の認証画面へ遷移し、戻ってきたら
      // getRedirectResult → onAuthStateChanged が自動で UI を更新する
    } else {
      await signInWithPopup(auth, provider);
    }
  } catch (error) {
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
// リダイレクト認証の結果処理（PWA スタンドアロン復帰時）
// ============================================================

// signInWithRedirect でリダイレクトから戻ってきた場合、
// getRedirectResult を呼んで結果を受け取る（成功時は onAuthStateChanged が UI を更新）
getRedirectResult(auth).catch((error) => {
  if (
    error.code === "auth/no-auth-event" ||
    error.code === "auth/null-user"
  ) {
    return; // リダイレクトなし or キャンセルは無視
  }
  console.error("リダイレクト認証エラー:", error);
  alert("ログインに失敗しました。もう一度お試しください。");
});

// ============================================================
// イベントリスナーの登録
// ============================================================

if (loginBtn)  loginBtn.addEventListener("click",  handleLogin);
if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
