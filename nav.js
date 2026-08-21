/**
 * 玩劇寶貝｜共用左側導覽選單（v2：整合登入身分與權限）
 * ------------------------------------------------
 * 用法不變：<script src="nav.js"></script>
 * 如果這個頁面同時有載入 auth-guard.js，選單會：
 *   - 依 window.GWP_AUTH.permissions 自動隱藏沒有權限的工具連結
 *   - 在選單底部顯示目前登入者姓名／email，並提供登出按鈕
 *   - 只有「管理層」看得到「權限管理」連結
 * 沒有載入 auth-guard.js 的頁面（例如家長端）行為跟以前完全一樣。
 */
(function(){
  var PAGES = [
    { href: 'home.html',              label: '首頁',              icon: '🏠', permKey: null },
    { href: 'teacher-upload.html',    label: '照片上傳（老師用）', icon: '📷', permKey: 'canUploadPhoto' },
    { href: 'admin-dashboard.html',   label: '照片管理後台',      icon: '🗂️', permKey: 'canViewAdminDashboard' },
    { href: 'attendance-checkin.html',label: '到課簽到',          icon: '✅', permKey: 'canCheckAttendance' },
    { href: 'schedule-poster.html',   label: '課表管理／家長版',   icon: '📅', permKey: 'canEditSchedule' },
    { href: 'parent-seat-check.html', label: '家長查空位',        icon: '🔍', permKey: null },
    { href: 'line-bind.html',         label: 'LINE 通知綁定',     icon: '💬', permKey: null },
    { href: 'permission-manage.html', label: '權限管理',          icon: '🔑', permKey: null, managementOnly: true }
  ];

  var currentFile = (location.pathname.split('/').pop() || '').toLowerCase();

  var style = document.createElement('style');
  style.textContent = [
    '#gwpTopBar{display:flex;align-items:center;gap:10px;background:#26232E;color:#fff;',
    '  padding:0 14px;height:46px;font-family:"Noto Sans TC",sans-serif;position:relative;z-index:10002;}',
    '#gwpTopBar .gwp-title{font-size:14px;font-weight:700;opacity:.9;}',
    '#gwpNavToggle{width:32px;height:32px;border-radius:8px;border:none;flex-shrink:0;',
    '  background:rgba(255,255,255,.14);color:#fff;font-size:16px;cursor:pointer;}',
    '#gwpSidebar{position:fixed;top:0;left:0;height:100vh;width:230px;background:#26232E;color:#fff;',
    '  z-index:10000;transform:translateX(-100%);transition:transform .25s ease;overflow-y:auto;',
    '  font-family:"Noto Sans TC",sans-serif;box-shadow:2px 0 16px rgba(0,0,0,.25);',
    '  display:flex;flex-direction:column;}',
    '#gwpSidebar.open{transform:translateX(0);}',
    '#gwpSidebar .gwp-brand{padding:22px 18px 16px;border-bottom:1px solid rgba(255,255,255,.1);}',
    '#gwpSidebar .gwp-brand .name{font-size:16px;font-weight:900;}',
    '#gwpSidebar .gwp-brand .sub{font-size:11px;opacity:.6;margin-top:2px;letter-spacing:1px;}',
    '#gwpSidebar ul{list-style:none;margin:0;padding:10px 0;flex:1;}',
    '#gwpSidebar a{display:flex;align-items:center;gap:10px;padding:13px 18px;',
    '  color:rgba(255,255,255,.75);text-decoration:none;font-size:13.5px;font-weight:600;',
    '  border-left:3px solid transparent;}',
    '#gwpSidebar a:hover{background:rgba(255,255,255,.07);color:#fff;}',
    '#gwpSidebar a.active{background:rgba(47,111,237,.2);color:#fff;border-left-color:#2F6FED;}',
    '#gwpSidebar a.gwp-hidden{display:none;}',
    '#gwpUserFooter{padding:14px 18px;border-top:1px solid rgba(255,255,255,.1);font-size:12px;}',
    '#gwpUserFooter .gwp-user-name{font-weight:700;color:#fff;font-size:13px;}',
    '#gwpUserFooter .gwp-user-role{color:rgba(255,255,255,.5);margin-top:2px;}',
    '#gwpUserFooter button{margin-top:10px;width:100%;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,.2);',
    '  background:none;color:rgba(255,255,255,.75);font-family:inherit;font-size:12px;cursor:pointer;}',
    '#gwpUserFooter button:hover{background:rgba(255,255,255,.08);}',
    '#gwpBackdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;',
    '  opacity:0;pointer-events:none;transition:opacity .2s;}',
    '#gwpBackdrop.show{opacity:1;pointer-events:auto;}',
    '@media (min-width:900px){',
    '  #gwpTopBar{display:none;}',
    '  #gwpSidebar{transform:translateX(0);box-shadow:none;border-right:1px solid rgba(255,255,255,.08);}',
    '  #gwpBackdrop{display:none;}',
    '  body{padding-left:230px;}',
    '}',
    '@media print{',
    '  #gwpTopBar,#gwpSidebar,#gwpBackdrop{display:none !important;}',
    '  body{padding-left:0 !important;}',
    '}'
  ].join('\n');
  document.head.appendChild(style);

  var topBar = document.createElement('div');
  topBar.id = 'gwpTopBar';
  topBar.innerHTML = '<button id="gwpNavToggle" aria-label="開啟選單">☰</button>' +
    '<span class="gwp-title">玩劇寶貝 管理工具</span>';
  document.body.insertBefore(topBar, document.body.firstChild);

  var backdrop = document.createElement('div');
  backdrop.id = 'gwpBackdrop';
  document.body.appendChild(backdrop);

  var sidebar = document.createElement('nav');
  sidebar.id = 'gwpSidebar';
  var linksHtml = PAGES.map(function(p){
    var isActive = p.href.toLowerCase() === currentFile;
    var cls = isActive ? 'active' : '';
    return '<li><a href="' + p.href + '" data-permkey="' + (p.permKey || '') +
      '" data-mgmt="' + (p.managementOnly ? '1' : '0') + '" class="' + cls + '">' +
      p.icon + ' ' + p.label + '</a></li>';
  }).join('');
  sidebar.innerHTML =
    '<div class="gwp-brand"><div class="name">🎨 玩劇寶貝</div><div class="sub">管理工具選單</div></div>' +
    '<ul>' + linksHtml + '</ul>' +
    '<div id="gwpUserFooter" style="display:none;"></div>';
  document.body.appendChild(sidebar);

  function openDrawer(){ sidebar.classList.add('open'); backdrop.classList.add('show'); }
  function closeDrawer(){ sidebar.classList.remove('open'); backdrop.classList.remove('show'); }

  document.getElementById('gwpNavToggle').addEventListener('click', openDrawer);
  backdrop.addEventListener('click', closeDrawer);

  // 如果這個頁面有載入 auth-guard.js，等身分確認後依權限調整選單
  if (window.gwpAuthReady && typeof window.gwpAuthReady.then === 'function') {
    window.gwpAuthReady.then(function(authInfo){
      var links = sidebar.querySelectorAll('a[data-permkey]');
      links.forEach(function(a){
        var permKey = a.getAttribute('data-permkey');
        var mgmtOnly = a.getAttribute('data-mgmt') === '1';
        var isManagement = authInfo.role === '管理層';
        if (mgmtOnly && !isManagement) {
          a.classList.add('gwp-hidden');
          return;
        }
        if (permKey && !isManagement && !authInfo.permissions[permKey]) {
          a.classList.add('gwp-hidden');
        }
      });

      var footer = document.getElementById('gwpUserFooter');
      footer.style.display = 'block';
      footer.innerHTML =
        '<div class="gwp-user-name">' + authInfo.name + '</div>' +
        '<div class="gwp-user-role">' + (authInfo.role || '') + '</div>' +
        '<button id="gwpNavSignOut">登出</button>';
      document.getElementById('gwpNavSignOut').addEventListener('click', function(){
        if (window.gwpSignOut) window.gwpSignOut();
      });
    });
  }
})();
