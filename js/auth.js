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
  const redirectPending = localStorage.getItem("saunaAuthRedirectPending");
  localStorage.removeItem("saunaAuthRedirectPending");

  try {
    // 8秒でタイムアウト（getRedirectResultが永遠に待ち続ける場合の検出）
    const timeoutError = Object.assign(new Error("タイムアウト"), { code: "TIMEOUT" });
    const result = await Promise.race([
      getRedirectResult(auth),
      new Promise((_, reject) => setTimeout(() => reject(timeoutError), 8000)),
    ]);

    if (result?.user) {
      alert(`[デバッグ] ログイン成功！\nメール: ${result.user.email}`);
    } else if (redirectPending) {
      alert("[デバッグ] リダイレクト後だが認証結果なし\n（Googleでの認証が完了しなかった）");
    }
  } catch (error) {
    const code = error?.code || error?.message || JSON.stringify(error) || "不明";
    alert(`[デバッグ] getRedirectResultエラー\nコード: ${code}`);
  }
}

processRedirectResult();

window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
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
  localStorage.setItem("saunaAuthRedirectPending", "1");
  try {
    await signInWithRedirect(auth, provider);
  } catch (error) {
    localStorage.removeItem("saunaAuthRedirectPending");
    const code = error?.code || error?.message || "不明";
    alert(`[デバッグ] signInWithRedirectエラー\nコード: ${code}`);
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
