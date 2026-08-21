/**
 * 玩劇寶貝｜Google 登入驗證 + 權限控管
 * ------------------------------------------------
 * 在每個「內部工具」頁面（老師/行政/管理層用）加上：
 *   <script type="module" src="auth-guard.js"></script>
 * 效果：
 *   1. 沒登入 → 顯示全螢幕「請用 Google 帳號登入」畫面，擋住底下內容
 *   2. 登入了但沒被授權（seat3/staff 裡查不到這個 email）→ 顯示「尚未開通」畫面
 *   3. 通過驗證 → 隱藏畫面，把身分資訊放到 window.GWP_AUTH，
 *      並讓 window.gwpAuthReady（一個 Promise）resolve，讓頁面自己的程式接續執行
 *
 * 權限資料存放位置（用 email 當 key，不用等對方登入過才能開權限）：
 *   seat3/staff/{emailKey}: {
 *     name, email, role: '管理層'|'正職老師'|'兼職老師'|'行政',
 *     active: true/false,
 *     permissions: {
 *       canUploadPhoto, canViewAdminDashboard, canCheckAttendance, canEditSchedule,
 *       visibleCourses: 'all' 或 ['courseId1','courseId2', ...]
 *     }
 *   }
 *
 * 頁面自己要做的事：
 *   - 在自己的初始化邏輯最前面 `await window.gwpAuthReady;` 再開始抓資料
 *   - 用 window.gwpHasCourseAccess(courseId) 判斷這個人看不看得到某堂課
 */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, get, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCQYP21uHGAeSj_i6ANMexMvp3_bciHvTw",
  authDomain: "otto2-2026.firebaseapp.com",
  databaseURL: "https://otto2-2026-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "otto2-2026",
  storageBucket: "otto2-2026.appspot.com",
  appId: "1:108328085665:web:071a45a7d7c5af6b6468e0"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const provider = new GoogleAuthProvider();

export function emailKey(email){
  return (email || '').toLowerCase().trim()
    .replace(/\./g, '_dot_')
    .replace(/@/g, '_at_')
    .replace(/[#$\[\]\/]/g, '_');
}
window.gwpEmailKey = emailKey;

// ---- overlay UI ----
const style = document.createElement('style');
style.textContent = `
#gwpAuthOverlay{
  position:fixed;inset:0;z-index:20000;
  background:#FBF8F2;display:flex;align-items:center;justify-content:center;
  font-family:'Noto Sans TC',sans-serif;
}
#gwpAuthCard{
  max-width:340px;width:88%;background:#fff;border:1px solid #E7E0D2;border-radius:18px;
  padding:32px 24px;text-align:center;box-shadow:0 8px 30px rgba(38,35,46,0.08);
}
#gwpAuthCard .gwp-logo{font-size:34px;margin-bottom:6px;}
#gwpAuthCard h2{margin:0 0 8px;font-size:17px;color:#26232E;}
#gwpAuthCard p{margin:0 0 20px;font-size:13px;color:#6B6674;line-height:1.6;white-space:pre-line;}
#gwpSignInBtn{
  display:inline-flex;align-items:center;gap:10px;
  padding:12px 20px;border-radius:12px;border:1.5px solid #E7E0D2;background:#fff;
  font-family:inherit;font-size:14px;font-weight:700;color:#26232E;cursor:pointer;
}
#gwpSignInBtn:hover{background:#F2ECE0;}
#gwpAuthSignOutBtn{
  margin-top:14px;background:none;border:none;color:#2F6FED;font-size:13px;
  font-weight:700;cursor:pointer;text-decoration:underline;font-family:inherit;
}
#gwpAuthSpinner{
  width:28px;height:28px;border-radius:50%;margin:0 auto 14px;
  border:3px solid #E7E0D2;border-top-color:#2F6FED;animation:gwpspin .8s linear infinite;
}
@keyframes gwpspin{to{transform:rotate(360deg);}}
`;
document.head.appendChild(style);

const overlay = document.createElement('div');
overlay.id = 'gwpAuthOverlay';
overlay.innerHTML = `
  <div id="gwpAuthCard">
    <div id="gwpAuthSpinner"></div>
    <p>確認登入狀態中…</p>
  </div>
`;
document.documentElement.appendChild(overlay);

function renderLogin(){
  overlay.style.display = 'flex';
  overlay.querySelector('#gwpAuthCard').innerHTML = `
    <div class="gwp-logo">🎨</div>
    <h2>玩劇寶貝 管理工具</h2>
    <p>請使用你的 Google 帳號登入，\n系統會依照管理層開通的權限顯示內容。</p>
    <button id="gwpSignInBtn">
      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.3 0 10.1-2 13.7-5.4l-6.3-5.3C29.4 35 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.3 5.3C40.9 36.1 44 30.6 44 24c0-1.3-.1-2.7-.4-3.5z"/></svg>
      使用 Google 登入
    </button>
  `;
  overlay.querySelector('#gwpSignInBtn').addEventListener('click', () => {
    signInWithPopup(auth, provider).catch(e => alert('登入失敗：' + e.message));
  });
}

function renderBlocked(message){
  overlay.style.display = 'flex';
  overlay.querySelector('#gwpAuthCard').innerHTML = `
    <div class="gwp-logo">🔒</div>
    <h2>尚未開通權限</h2>
    <p>${message}</p>
    <button id="gwpAuthSignOutBtn">登出，換一個帳號</button>
  `;
  overlay.querySelector('#gwpAuthSignOutBtn').addEventListener('click', () => signOut(auth));
}

function hideOverlay(){
  overlay.style.display = 'none';
}

let resolveReady;
window.gwpAuthReady = new Promise((resolve) => { resolveReady = resolve; });

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.GWP_AUTH = null;
    renderLogin();
    return;
  }
  try {
    const key = emailKey(user.email);
    const snap = await get(ref(db, `seat3/staff/${key}`));
    if (!snap.exists()) {
      renderBlocked(`此 Google 帳號尚未被授權使用本系統。\n\n登入帳號：${user.email}\n\n請將這個 email 提供給管理層，在「權限管理」頁面開通。`);
      return;
    }
    const staff = snap.val();
    if (staff.active === false) {
      renderBlocked(`此帳號已被管理層停用。\n\n如有疑問請聯繫管理層。`);
      return;
    }
    // 記錄 uid，方便日後對照（不影響用 email 查詢的主要邏輯）
    if (staff.uid !== user.uid) {
      update(ref(db, `seat3/staff/${key}`), { uid: user.uid }).catch(() => {});
    }
    window.GWP_AUTH = {
      uid: user.uid,
      email: user.email,
      emailKey: key,
      name: staff.name || user.displayName || user.email,
      role: staff.role || '',
      permissions: staff.permissions || {}
    };
    hideOverlay();
    resolveReady(window.GWP_AUTH);
  } catch (e) {
    console.error('auth-guard error', e);
    renderBlocked('讀取權限資料時發生錯誤，請重新整理頁面再試一次。');
  }
});

window.gwpSignOut = () => signOut(auth);

// ---- 權限判斷輔助函式，給各頁面自己的邏輯使用 ----
window.gwpHasFeature = function(featureKey){
  if (!window.GWP_AUTH) return false;
  if (window.GWP_AUTH.role === '管理層') return true;
  return !!window.GWP_AUTH.permissions[featureKey];
};

window.gwpHasCourseAccess = function(courseId){
  if (!window.GWP_AUTH) return false;
  if (window.GWP_AUTH.role === '管理層') return true;
  const vc = window.GWP_AUTH.permissions.visibleCourses;
  if (vc === 'all') return true;
  if (Array.isArray(vc)) return vc.indexOf(courseId) !== -1;
  return false;
};

window.gwpFilterCourses = function(courses){
  if (!window.GWP_AUTH) return [];
  if (window.GWP_AUTH.role === '管理層') return courses;
  const vc = window.GWP_AUTH.permissions.visibleCourses;
  if (vc === 'all') return courses;
  if (!Array.isArray(vc)) return [];
  return courses.filter(c => vc.indexOf(c.id) !== -1);
};
