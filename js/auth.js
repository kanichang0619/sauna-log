/**
 * auth.js - Google ログイン・ログアウト処理
 *
 * ページ上部のログインボタンを管理します。
 * ログイン状態に応じてボタンとユーザー情報の表示を切り替えます。
 *
 * ── ログイン方式について ─────────────────────────────────────
 * ポップアップではなくリダイレクト方式を使います。
 * ポップアップ方式ではパスキー選択時にウィンドウが閉じられてしまい
 * ログインが完了しない問題があるためです。
 * リダイレクト方式はブラウザ・PWAスタンドアロンいずれでも動作します。
 * ────────────────────────────────────────────────────────────
 *
 * このファイルは type="module" として読み込まれます。
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
// 前回のリダイレクトログイン結果を受け取る
// signInWithRedirect でのログインが成功していた場合に onAuthStateChanged が呼ばれる
// ============================================================
async function processRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      console.log("[Auth] リダイレクトログイン成功:", result.user.email);
      alert(`[デバッグ] ログイン成功！\nメール: ${result.user.email}\n\nこのアラートが見えたら教えてください`);
    } else {
      console.log("[Auth] getRedirectResult: null");
    }
  } catch (error) {
    console.error("[Auth] getRedirectResult エラー:", error.code, error.message);
    alert(`[デバッグ] リダイレクト結果エラー\nコード: ${error.code}\n\nスクショを撮ってください`);
  }
}

// 通常ロード時にリダイレクト結果を確認
processRedirectResult();

// bfcache（Safariの戻るボタン等でキャッシュ復元）された場合も再実行
// bfcache では load イベントが発火しないため getRedirectResult が呼ばれない問題への対処
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  console.log("[Auth] bfcacheから復元 - getRedirectResultを再実行");
  alert("[デバッグ] bfcacheから復元されました。これが見えたら教えてください。");
  processRedirectResult();
});

// ============================================================
// ログイン処理
// ============================================================

/**
 * 「Googleでログイン」ボタンを押したときの処理
 * リダイレクト方式を使用。ブラウザ・PWA・パスキーすべてに対応。
 */
async function handleLogin() {
  const provider = new GoogleAuthProvider();
  // 前回のリダイレクト保留状態をリセット（2回目以降の即時戻り問題の対策）
  try {
    Object.keys(sessionStorage)
      .filter(key => key.includes("firebase"))
      .forEach(key => sessionStorage.removeItem(key));
  } catch (e) { /* ストレージアクセス不可の場合は無視 */ }
  try {
    await signInWithRedirect(auth, provider);
  } catch (error) {
    console.error("[Auth] ログインエラー:", error.code, error.message);
    alert(`[デバッグ] ログインエラー\nコード: ${error.code}\n\nスクショを撮ってください`);
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
