/**
 * auth.js - Google ログイン・ログアウト処理
 *
 * ページ上部のログインボタンを管理します。
 * ログイン状態に応じてボタンとユーザー情報の表示を切り替えます。
 *
 * ── ホーム画面アプリ（standalone）での注意 ──────────────────
 * iPhoneのホーム画面から起動したとき（standalone モード）は
 * ポップアップが使えないため、リダイレクト方式に自動切替します。
 * ────────────────────────────────────────────────────────────
 *
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

// ---- DOM 要素の参照 ----
const loginBtn   = document.getElementById("login-btn");
const logoutBtn  = document.getElementById("logout-btn");
const userInfo   = document.getElementById("user-info");
const userAvatar = document.getElementById("user-avatar");
const userName   = document.getElementById("user-name");

// ============================================================
// ホーム画面アプリ（standalone）かどうかの判定
// ============================================================

/**
 * ホーム画面から起動した「アプリ風モード」のときは true になる
 * iOS Safari の window.navigator.standalone と
 * Chrome等の matchMedia で判定する
 */
const isStandalone =
  window.navigator.standalone === true ||
  window.matchMedia("(display-mode: standalone)").matches;

// ============================================================
// リダイレクトログインの結果を受け取る（standalone モード用）
// ============================================================

/**
 * standalone モードでリダイレクトログインした後、
 * アプリに戻ってきたときに結果を受け取る
 * 通常のポップアップログイン時は何も起きない
 */
getRedirectResult(auth).catch((error) => {
  // エラーがある場合だけ処理（結果なしの null は正常）
  if (error && error.code) {
    console.error("リダイレクトログイン結果エラー:", error);
    alert("ログインに失敗しました。もう一度お試しください。");
  }
});

// ============================================================
// ログイン処理
// ============================================================

/**
 * 「Googleでログイン」ボタンを押したときの処理
 *
 * ・通常のブラウザ  → ポップアップ画面でGoogleアカウントを選んで認証
 * ・ホーム画面アプリ → Googleのページにリダイレクトして認証（ポップアップ不可のため）
 */
async function handleLogin() {
  const provider = new GoogleAuthProvider();
  try {
    if (isStandalone) {
      // ホーム画面アプリはポップアップが動作しないのでリダイレクト方式を使う
      await signInWithRedirect(auth, provider);
      // リダイレクト後は Google のページに移動し、戻ってきたら
      // getRedirectResult と onAuthStateChanged が自動で処理する
    } else {
      // 通常ブラウザはポップアップ方式
      await signInWithPopup(auth, provider);
    }
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

    window.SaunaAuth = window.SaunaAuth || {};
    window.SaunaAuth.user = user;
    window.SaunaAuth.uid  = user.uid;

    window.dispatchEvent(new CustomEvent("sauna-auth-changed", { detail: { user } }));

  } else {
    // ---- 未ログイン ----
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
