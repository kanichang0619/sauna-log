/**
 * auth.js - Google ログイン・ログアウト処理
 *
 * ページ上部のログインボタンを管理します。
 * ログイン状態に応じてボタンとユーザー情報の表示を切り替えます。
 *
 * ── ログイン方式について ─────────────────────────────────────
 * PWA スタンドアロンモード（ホーム画面アプリ）では signInWithRedirect を使います。
 * スタンドアロンモードでは、ポップアップに使う SFSafariViewController が
 * システムのパスキーダイアログ表示時に閉じられるため、パスキーでのログインに
 * 失敗します。リダイレクト方式ならパスキーも含めて確実に動作します。
 *
 * 通常ブラウザでは signInWithPopup を優先し、ブロック・既存ポップアップ重複の
 * 場合のみリダイレクト方式にフォールバックします。
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

// PWA スタンドアロンモードかどうかを判定
const isStandalone =
  window.navigator.standalone === true ||
  window.matchMedia("(display-mode: standalone)").matches;

// ============================================================
// 前回のリダイレクトログイン結果を受け取る
// signInWithRedirect でのログインが成功していた場合に onAuthStateChanged が呼ばれる
// ============================================================
getRedirectResult(auth).then((result) => {
  if (result?.user) {
    console.log("[Auth] リダイレクトログイン成功");
  }
}).catch((error) => {
  if (error?.code) {
    console.warn("[Auth] リダイレクト結果エラー:", error.code);
  }
});

// ============================================================
// ログイン処理
// ============================================================

/**
 * 「Googleでログイン」ボタンを押したときの処理
 *
 * スタンドアロンモード（PWA）: signInWithRedirect を使用
 *   パスキー選択時に SFSafariViewController が閉じられる問題を回避するため。
 *
 * 通常ブラウザ: signInWithPopup を優先
 *   ブロック・重複リクエストの場合は signInWithRedirect にフォールバック。
 */
async function handleLogin() {
  const provider = new GoogleAuthProvider();

  if (isStandalone) {
    // スタンドアロンモードはリダイレクト方式で確実にログイン
    try {
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error("[Auth] ログインエラー:", error);
      alert("ログインに失敗しました。もう一度お試しください。");
    }
    return;
  }

  // 通常ブラウザ: ポップアップ方式を試みる
  try {
    await signInWithPopup(auth, provider);
    // ログイン成功 → onAuthStateChanged が自動で呼ばれて UI が更新される

  } catch (error) {
    // ユーザーが自分でポップアップを閉じた場合は無視する
    if (error.code === "auth/popup-closed-by-user") {
      return;
    }

    // ポップアップがブロックされた、または前回のポップアップ操作が未完了の場合
    // → リダイレクト方式にフォールバック（2回目以降ボタンが反応しない問題の対処）
    if (
      error.code === "auth/popup-blocked" ||
      error.code === "auth/cancelled-popup-request"
    ) {
      console.warn("[Auth] ポップアップ不可のためリダイレクト方式に切り替えます:", error.code);
      try {
        await signInWithRedirect(auth, provider);
      } catch (redirectError) {
        console.error("[Auth] リダイレクトエラー:", redirectError);
        alert("ログインに失敗しました。もう一度お試しください。");
      }
      return;
    }

    console.error("[Auth] ログインエラー:", error);
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
    console.error("[Auth] ログアウトエラー:", error);
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
