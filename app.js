/**
 * Modern Memo App (MemoHub) with Firebase Cloud Firestore & Authentication
 * Multi-user support with isolated user collections and realtime sync.
 */

import {
  db,
  auth,
  googleProvider,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  signInAnonymously
} from './firebase-config.js';

(function () {
  'use strict';

  const INITIAL_SAMPLE_MEMO_IDS = new Set(['memo-welcome-1', 'memo-todo-2', 'memo-idea-3']);

  function isInitialSampleMemo(memo) {
    return INITIAL_SAMPLE_MEMO_IDS.has(memo.id);
  }

  // =========================================================================
  // State Management
  // =========================================================================
  let currentUser = null;
  let firestoreUnsubscribe = null;
  let trashUnsubscribe = null;
  let isFirebaseConnected = false;

  let memos = [];
  let trashMemos = [];
  let currentCategory = 'all';
  let searchQuery = '';
  let currentSort = 'updated-desc';
  let viewMode = 'grid'; // 'grid' | 'list'
  let pendingDeleteMemo = null;
  let undoTimeout = null;
  let lastDeletedMemo = null;

  // Selected Modal State
  let modalIsPinned = false;
  let modalSelectedColor = 'default';

  // Auth Mode State ('login' | 'signup')
  let authMode = 'login';

  // =========================================================================
  // DOM Elements
  // =========================================================================
  const memoContainer = document.getElementById('memoContainer');
  const pinnedContainer = document.getElementById('pinnedContainer');
  const pinnedSection = document.getElementById('pinnedSection');
  const pinnedCountBadge = document.getElementById('pinnedCountBadge');
  const generalTitleWrap = document.getElementById('generalTitleWrap');
  const generalCountBadge = document.getElementById('generalCountBadge');
  const emptyState = document.getElementById('emptyState');
  const emptyTitle = document.getElementById('emptyTitle');
  const emptyDesc = document.getElementById('emptyDesc');

  // Cloud Status elements
  const cloudStatusBadge = document.getElementById('cloudStatusBadge');
  const cloudStatusText = document.getElementById('cloudStatusText');

  // Auth & Profile elements
  const btnLoginTrigger = document.getElementById('btnLoginTrigger');
  const userProfileWrapper = document.getElementById('userProfileWrapper');
  const userAvatarBtn = document.getElementById('userAvatarBtn');
  const userAvatarImg = document.getElementById('userAvatarImg');
  const userAvatarInitial = document.getElementById('userAvatarInitial');
  const userProfileDropdown = document.getElementById('userProfileDropdown');
  const userDisplayName = document.getElementById('userDisplayName');
  const userDisplayEmail = document.getElementById('userDisplayEmail');
  const userMemoCount = document.getElementById('userMemoCount');
  const btnLogout = document.getElementById('btnLogout');

  // Auth Modal elements
  const authModal = document.getElementById('authModal');
  const authModalTitle = document.getElementById('authModalTitle');
  const authCloseBtn = document.getElementById('authCloseBtn');
  const btnGoogleLogin = document.getElementById('btnGoogleLogin');
  const tabLogin = document.getElementById('tabLogin');
  const tabSignup = document.getElementById('tabSignup');
  const authForm = document.getElementById('authForm');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');
  const btnAuthSubmit = document.getElementById('btnAuthSubmit');
  const authErrorAlert = document.getElementById('authErrorAlert');
  const btnGuestLogin = document.getElementById('btnGuestLogin');

  // Search & Filter elements
  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const searchKbdHint = document.getElementById('searchKbdHint');
  const sortSelect = document.getElementById('sortSelect');
  const btnGridView = document.getElementById('btnGridView');
  const btnListView = document.getElementById('btnListView');
  const categoryPills = document.querySelectorAll('.category-pill');

  // Buttons & Controls
  const btnNewMemo = document.getElementById('btnNewMemo');
  const btnEmptyCreate = document.getElementById('btnEmptyCreate');
  const fabBtn = document.getElementById('fabBtn');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const btnMenu = document.getElementById('btnMenu');
  const menuDropdown = document.getElementById('menuDropdown');
  const btnExportJson = document.getElementById('btnExportJson');
  const btnImportJson = document.getElementById('btnImportJson');
  const importFileInput = document.getElementById('importFileInput');
  const btnClearAll = document.getElementById('btnClearAll');

  // Modal Elements
  const memoModal = document.getElementById('memoModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const btnCancelModal = document.getElementById('btnCancelModal');
  const memoForm = document.getElementById('memoForm');
  const editMemoId = document.getElementById('editMemoId');
  const memoTitleInput = document.getElementById('memoTitleInput');
  const memoCategorySelect = document.getElementById('memoCategorySelect');
  const colorPalette = document.getElementById('colorPalette');
  const memoContentInput = document.getElementById('memoContentInput');
  const modalPinBtn = document.getElementById('modalPinBtn');
  const charWordCount = document.getElementById('charWordCount');
  const modalDateInfo = document.getElementById('modalDateInfo');
  const dateInput = document.getElementById('dateInput');
  const btnInsertToday = document.getElementById('btnInsertToday');
  const btnInsertSelectedDate = document.getElementById('btnInsertSelectedDate');

  // Delete Confirm Modal
  const deleteModal = document.getElementById('deleteModal');
  const deleteCloseBtn = document.getElementById('deleteCloseBtn');
  const btnCancelDelete = document.getElementById('btnCancelDelete');
  const btnConfirmDelete = document.getElementById('btnConfirmDelete');

  // Toast Container
  const toastContainer = document.getElementById('toastContainer');

  // =========================================================================
  // Initialization & Auth Listener
  // =========================================================================
  function initApp() {
    loadPreferences();
    setupEventListeners();
    setupDialogBackdropFallback(memoModal);
    setupDialogBackdropFallback(deleteModal);
    setupDialogBackdropFallback(authModal);

    // Listen to Firebase Authentication State Changes
    onAuthStateChanged(auth, handleAuthStateChanged);
  }

  function handleAuthStateChanged(user) {
    currentUser = user;

    if (user) {
      // User is logged in
      console.log('User signed in:', user.uid, user.email);
      updateAuthUI(user);
      initUserMemosSync(user);
    } else {
      // User is logged out
      console.log('User signed out.');
      updateAuthUI(null);
      if (firestoreUnsubscribe) {
        firestoreUnsubscribe();
        firestoreUnsubscribe = null;
      }
      if (trashUnsubscribe) {
        trashUnsubscribe();
        trashUnsubscribe = null;
      }
      isFirebaseConnected = false;
      updateCloudStatus('local-fallback', '로그인 필요');
      loadGuestLocalMemos();
      trashMemos = [];
      renderApp();
    }
  }

  function updateAuthUI(user) {
    if (user) {
      btnLoginTrigger.style.display = 'none';
      userProfileWrapper.style.display = 'block';

      const name = user.displayName || user.email ? user.email.split('@')[0] : (user.isAnonymous ? '게스트 사용자' : '사용자');
      const email = user.email || (user.isAnonymous ? '익명 계정' : '');
      const initial = (name || 'U').charAt(0).toUpperCase();

      userDisplayName.textContent = name;
      userDisplayEmail.textContent = email;
      userAvatarInitial.textContent = initial;

      if (user.photoURL) {
        userAvatarImg.src = user.photoURL;
        userAvatarImg.style.display = 'block';
        userAvatarInitial.style.display = 'none';
      } else {
        userAvatarImg.style.display = 'none';
        userAvatarInitial.style.display = 'flex';
      }
    } else {
      btnLoginTrigger.style.display = 'inline-flex';
      userProfileWrapper.style.display = 'none';
      userProfileWrapper.classList.remove('open');
    }
  }

  function updateCloudStatus(status, text) {
    if (!cloudStatusBadge || !cloudStatusText) return;
    cloudStatusBadge.className = `cloud-status-badge ${status}`;
    cloudStatusText.textContent = text;
  }

  // =========================================================================
  // User-Isolated Cloud Firestore Sync
  // =========================================================================
  function initUserMemosSync(user) {
    updateCloudStatus('connecting', '클라우드 동기화 중...');

    if (firestoreUnsubscribe) {
      firestoreUnsubscribe();
      firestoreUnsubscribe = null;
    }

    try {
      // User-specific subcollection: users/{uid}/memos
      const userMemosRef = collection(db, 'users', user.uid, 'memos');
      const q = query(userMemosRef, orderBy('updatedAt', 'desc'));

      firestoreUnsubscribe = onSnapshot(
        q,
        (snapshot) => {
          isFirebaseConnected = true;
          updateCloudStatus('connected', 'Cloud 동기화됨');

          if (snapshot.empty) {
            memos = [];
            saveUserLocalBackup();
            if (userMemoCount) userMemoCount.textContent = '0개';
            renderApp();
          } else {
            const remoteMemos = [];
            snapshot.forEach((docSnap) => {
              const memo = {
                id: docSnap.id,
                ...docSnap.data()
              };
              if (isInitialSampleMemo(memo)) {
                deleteDoc(doc(db, 'users', user.uid, 'memos', memo.id)).catch((err) =>
                  console.warn('Sample memo cleanup error:', err)
                );
              } else {
                remoteMemos.push(memo);
              }
            });
            memos = remoteMemos;
            saveUserLocalBackup();
            if (userMemoCount) userMemoCount.textContent = `${memos.length}개`;
            renderApp();
          }
        },
        (error) => {
          console.warn('Firestore user sync error:', error.message);
          isFirebaseConnected = false;
          if (error.code === 'permission-denied' || error.message.includes('permission')) {
            updateCloudStatus('local-fallback', '로컬 모드 (보안 규칙 확인 필요)');
            showToast('Firestore 보안 규칙에 읽기/쓰기 권한이 허용되어 있는지 확인해주세요.', 'error');
          } else if (error.code === 'failed-precondition' || error.message.includes('does not exist')) {
            updateCloudStatus('local-fallback', '로컬 모드 (Firestore 생성 필요)');
            showToast('Firebase 콘솔에서 Firestore Database를 생성해주세요.', 'error');
          } else {
            updateCloudStatus('local-fallback', '오프라인 (로컬 모드)');
          }
          loadUserLocalBackup();
          renderApp();
        }
      );
      initTrashSync(user);
    } catch (e) {
      console.error('Firebase sync listener setup failed:', e);
      isFirebaseConnected = false;
      updateCloudStatus('local-fallback', '로컬 모드');
      loadUserLocalBackup();
      renderApp();
    }
  }

  function initTrashSync(user) {
    const trashRef = collection(db, 'users', user.uid, 'trash');

    trashUnsubscribe = onSnapshot(
      trashRef,
      (snapshot) => {
        const expiredIds = [];
        trashMemos = [];
        snapshot.forEach((docSnap) => {
          const item = { id: docSnap.id, ...docSnap.data() };
          if (isInitialSampleMemo(item)) {
            deleteDoc(doc(db, 'users', user.uid, 'trash', item.id)).catch((err) =>
              console.warn('Sample trash cleanup error:', err)
            );
          } else if (item.deletedAt && Date.now() - item.deletedAt >= 7 * 24 * 60 * 60 * 1000) {
            expiredIds.push(item.id);
          } else {
            trashMemos.push(item);
          }
        });

        expiredIds.forEach((id) => {
          deleteDoc(doc(db, 'users', user.uid, 'trash', id)).catch((err) =>
            console.warn('Expired trash cleanup error:', err)
          );
        });
        saveTrashLocalBackup();
        renderApp();
      },
      (error) => {
        console.warn('Firestore trash sync error:', error.message);
        loadTrashLocalBackup();
        purgeExpiredTrashLocal();
        renderApp();
      }
    );
  }

  function saveUserLocalBackup() {
    if (!currentUser) return;
    try {
      localStorage.setItem('memo-items-' + currentUser.uid, JSON.stringify(memos));
    } catch (e) {
      console.warn('LocalStorage save limit:', e);
    }
  }

  function loadUserLocalBackup() {
    if (!currentUser) return;
    try {
      const stored = localStorage.getItem('memo-items-' + currentUser.uid);
      if (stored) {
        memos = JSON.parse(stored).filter((memo) => !isInitialSampleMemo(memo));
        saveUserLocalBackup();
      }
    } catch (e) {
      console.warn('LocalStorage read error:', e);
    }
  }

  function loadGuestLocalMemos() {
    try {
      const stored = localStorage.getItem('memo-items-guest');
      if (stored) {
        memos = JSON.parse(stored).filter((memo) => !isInitialSampleMemo(memo));
      } else {
        memos = [];
      }
      localStorage.setItem('memo-items-guest', JSON.stringify(memos));
    } catch (e) {
      memos = [];
    }
  }

  function saveGuestLocalMemos() {
    try {
      localStorage.setItem('memo-items-guest', JSON.stringify(memos));
    } catch (e) {}
  }

  function saveTrashLocalBackup() {
    if (!currentUser) return;
    try {
      localStorage.setItem('memo-trash-' + currentUser.uid, JSON.stringify(trashMemos));
    } catch (e) {
      console.warn('Trash localStorage save error:', e);
    }
  }

  function loadTrashLocalBackup() {
    if (!currentUser) return;
    try {
      const stored = localStorage.getItem('memo-trash-' + currentUser.uid);
      trashMemos = stored ? JSON.parse(stored).filter((memo) => !isInitialSampleMemo(memo)) : [];
      saveTrashLocalBackup();
    } catch (e) {
      trashMemos = [];
    }
  }

  function purgeExpiredTrashLocal() {
    const expiration = 7 * 24 * 60 * 60 * 1000;
    const beforeCount = trashMemos.length;
    trashMemos = trashMemos.filter((memo) => !memo.deletedAt || Date.now() - memo.deletedAt < expiration);
    if (trashMemos.length !== beforeCount) saveTrashLocalBackup();
  }

  function loadPreferences() {
    const savedView = localStorage.getItem('memo-view-mode');
    if (savedView === 'list' || savedView === 'grid') {
      viewMode = savedView;
      updateViewToggleButtons();
    }

    const savedSort = localStorage.getItem('memo-sort-order');
    if (savedSort && sortSelect) {
      currentSort = savedSort;
      sortSelect.value = savedSort;
    }
  }

  // =========================================================================
  // Formatting & Markdown Utilities
  // =========================================================================
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function highlightMatch(text, query) {
    if (!query) return text;
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return text.replace(regex, '<mark class="memo-highlight">$1</mark>');
  }

  function formatRelativeDate(timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = now - timestamp;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) return '방금 전';
    if (diff < hour) return `${Math.floor(diff / minute)}분 전`;
    if (diff < day) return `${Math.floor(diff / hour)}시간 전`;
    if (diff < 7 * day) return `${Math.floor(diff / day)}일 전`;

    const date = new Date(timestamp);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  }

  function formatFullDateTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function renderContentHtml(content, memoId, query = '') {
    if (!content) return '';
    const lines = content.split('\n');
    let html = '';
    let lineIdx = 0;

    for (const line of lines) {
      const todoUnchecked = line.match(/^-\s*\[\s*\]\s+(.*)$/);
      const todoChecked = line.match(/^-\s*\[x\]\s+(.*)$/i);

      if (todoUnchecked) {
        const text = formatInlineMarkdown(escapeHtml(todoUnchecked[1]), query);
        html += `<div class="checklist-item" data-memo-id="${memoId}" data-line="${lineIdx}">
          <input type="checkbox" class="checklist-checkbox" aria-label="할 일 완료 토글">
          <span class="checklist-text">${text}</span>
        </div>`;
      } else if (todoChecked) {
        const text = formatInlineMarkdown(escapeHtml(todoChecked[1]), query);
        html += `<div class="checklist-item checked" data-memo-id="${memoId}" data-line="${lineIdx}">
          <input type="checkbox" class="checklist-checkbox" checked aria-label="할 일 완료 토글">
          <span class="checklist-text">${text}</span>
        </div>`;
      } else if (line.startsWith('# ')) {
        const text = formatInlineMarkdown(escapeHtml(line.slice(2)), query);
        html += `<div style="font-weight:700;font-size:1.05em;margin:4px 0;">${text}</div>`;
      } else if (line.startsWith('## ')) {
        const text = formatInlineMarkdown(escapeHtml(line.slice(3)), query);
        html += `<div style="font-weight:600;font-size:0.98em;margin:4px 0;">${text}</div>`;
      } else if (line.match(/^-\s+(.*)$/)) {
        const bulletMatch = line.match(/^-\s+(.*)$/);
        const text = formatInlineMarkdown(escapeHtml(bulletMatch[1]), query);
        html += `<div style="padding-left:14px;position:relative;margin:2px 0;"><span style="position:absolute;left:2px;color:var(--color-primary);font-weight:bold;">•</span>${text}</div>`;
      } else if (line.trim() === '') {
        html += '<div style="height: 6px;"></div>';
      } else {
        const text = formatInlineMarkdown(escapeHtml(line), query);
        html += `<div>${text}</div>`;
      }
      lineIdx++;
    }

    return html;
  }

  function formatInlineMarkdown(text, query) {
    let result = text;
    result = result.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/\*(.*?)\*/g, '<em>$1</em>');
    result = result.replace(/`(.*?)`/g, '<code class="memo-code-inline">$1</code>');
    if (query) {
      result = highlightMatch(result, query);
    }
    return result;
  }

  function getCategoryName(category) {
    switch (category) {
      case 'work': return '업무';
      case 'personal': return '개인';
      case 'idea': return '아이디어';
      case 'todo': return '할 일';
      case 'study': return '공부';
      default: return '일반';
    }
  }

  // =========================================================================
  // Filtering, Sorting & Rendering
  // =========================================================================
  function getFilteredAndSortedMemos() {
    const sourceMemos = currentCategory === 'trash' ? trashMemos : memos;
    let list = sourceMemos.filter((item) => {
      if (currentCategory === 'trash') return true;
      if (currentCategory === 'pinned' && !item.isPinned) return false;
      if (currentCategory !== 'all' && currentCategory !== 'pinned' && item.category !== currentCategory) {
        return false;
      }

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const inTitle = item.title && item.title.toLowerCase().includes(q);
        const inContent = item.content && item.content.toLowerCase().includes(q);
        if (!inTitle && !inContent) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (currentSort === 'updated-desc') {
        return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
      }
      if (currentSort === 'created-desc') {
        return b.createdAt - a.createdAt;
      }
      if (currentSort === 'created-asc') {
        return a.createdAt - b.createdAt;
      }
      if (currentSort === 'title-asc') {
        return (a.title || '').localeCompare(b.title || '');
      }
      return 0;
    });

    return list;
  }

  function updateCategoryCounts() {
    const totalCount = memos.length;
    const pinnedCount = memos.filter((m) => m.isPinned).length;
    const workCount = memos.filter((m) => m.category === 'work').length;
    const personalCount = memos.filter((m) => m.category === 'personal').length;
    const ideaCount = memos.filter((m) => m.category === 'idea').length;
    const todoCount = memos.filter((m) => m.category === 'todo').length;
    const studyCount = memos.filter((m) => m.category === 'study').length;

    const setBadge = (id, count) => {
      const el = document.getElementById(id);
      if (el) el.textContent = count;
    };

    setBadge('count-all', totalCount);
    setBadge('count-pinned', pinnedCount);
    setBadge('count-work', workCount);
    setBadge('count-personal', personalCount);
    setBadge('count-idea', ideaCount);
    setBadge('count-todo', todoCount);
    setBadge('count-study', studyCount);
    setBadge('count-trash', trashMemos.length);
  }

  function createMemoCardElement(memo) {
    const card = document.createElement('article');
    card.className = `memo-card color-${memo.color || 'default'} ${memo.isPinned ? 'is-pinned' : ''}`;
    card.dataset.id = memo.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${memo.title} ${currentCategory === 'trash' ? '휴지통 메모' : '메모 열기'}`);

    const titleHtml = highlightMatch(escapeHtml(memo.title || '제목 없음'), searchQuery);
    const contentHtml = renderContentHtml(memo.content, memo.id, searchQuery);
    const dateFormatted = formatRelativeDate(memo.updatedAt || memo.createdAt);
    const createdDateFormatted = formatFullDateTime(memo.createdAt);
    const fullDate = formatFullDateTime(memo.updatedAt || memo.createdAt);

    card.innerHTML = `
      <div>
        <div class="memo-card-header">
          <span class="card-category-badge cat-${memo.category}">
            ${getCategoryName(memo.category)}
          </span>
          <div class="card-actions-quick" onclick="event.stopPropagation();">
            ${currentCategory === 'trash' ? '' : `<button type="button" class="btn-card-action btn-pin ${memo.isPinned ? 'active' : ''}" title="${memo.isPinned ? '고정 해제' : '상단 고정'}" aria-label="고정 토글">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="${memo.isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6l.8.8.8-.8v-6H18v-2l-2-2z"/>
              </svg>
            </button>`}
            <button type="button" class="btn-card-action btn-copy" title="내용 클립보드 복사" aria-label="내용 복사">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            <button type="button" class="btn-card-action btn-download" title="마크다운(.md) 다운로드" aria-label="다운로드">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </button>
            ${currentCategory === 'trash' ? `<button type="button" class="btn-card-action btn-restore" title="메모 복원" aria-label="메모 복원">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 1 0 3-6.7"></path>
                <polyline points="3 4 3 10 9 10"></polyline>
              </svg>
            </button>` : ''}
            <button type="button" class="btn-card-action action-delete btn-delete" title="${currentCategory === 'trash' ? '영구 삭제' : '휴지통으로 이동'}" aria-label="${currentCategory === 'trash' ? '영구 삭제' : '휴지통으로 이동'}">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        <h3 class="memo-card-title">${titleHtml}</h3>
        <div class="memo-card-body ${memo.content && memo.content.length > 200 ? 'has-overflow' : ''}">${contentHtml}</div>
      </div>
      <div class="memo-card-footer">
        <span class="card-date" title="최종 수정: ${fullDate}">작성일: ${createdDateFormatted || dateFormatted}</span>
        <span class="card-hint">클릭하여 편집</span>
      </div>
    `;

    card.addEventListener('click', () => {
      if (currentCategory !== 'trash') openEditModal(memo.id);
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (currentCategory !== 'trash') openEditModal(memo.id);
      }
    });

    // Quick Actions
    const btnPin = card.querySelector('.btn-pin');
    if (btnPin) {
      btnPin.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePinMemo(memo.id);
      });
    }

    const btnCopy = card.querySelector('.btn-copy');
    btnCopy.addEventListener('click', (e) => {
      e.stopPropagation();
      copyMemoToClipboard(memo);
    });

    const btnDownload = card.querySelector('.btn-download');
    btnDownload.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadSingleMemoMarkdown(memo);
    });

    const btnRestore = card.querySelector('.btn-restore');
    if (btnRestore) {
      btnRestore.addEventListener('click', (e) => {
        e.stopPropagation();
        restoreMemo(memo.id);
      });
    }

    const btnDelete = card.querySelector('.btn-delete');
    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentCategory === 'trash') {
        permanentlyDeleteMemo(memo.id);
      } else {
        openDeleteConfirmModal(memo.id);
      }
    });

    // Interactive Checkboxes
    const checkboxes = card.querySelectorAll('.checklist-checkbox');
    checkboxes.forEach((cb) => {
      cb.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        const itemWrap = cb.closest('.checklist-item');
        const lineIndex = parseInt(itemWrap.dataset.line, 10);
        toggleChecklistLine(memo.id, lineIndex, cb.checked);
      });
    });

    return card;
  }

  function renderApp() {
    updateCategoryCounts();
    const filteredMemos = getFilteredAndSortedMemos();

    memoContainer.className = `memos-container ${viewMode}-view`;
    pinnedContainer.className = `memos-container ${viewMode}-view`;

    memoContainer.innerHTML = '';
    pinnedContainer.innerHTML = '';

    if (filteredMemos.length === 0) {
      pinnedSection.style.display = 'none';
      generalTitleWrap.style.display = 'none';
      emptyState.style.display = 'flex';

      if (searchQuery) {
        emptyTitle.textContent = `'${searchQuery}' 검색 결과가 없습니다`;
        emptyDesc.textContent = '다른 키워드로 검색하거나 필터를 재설정해 보세요.';
      } else if (currentCategory === 'pinned') {
        emptyTitle.textContent = '고정된 메모가 없습니다';
        emptyDesc.textContent = '중요한 메모의 별표 아이콘을 눌러 상단에 고정해 보세요.';
      } else {
        emptyTitle.textContent = currentUser ? '작성된 메모가 없습니다' : '아직 작성된 메모가 없습니다';
        emptyDesc.textContent = currentUser
          ? '새로운 아이디어나 오늘 할 일을 첫 번째 메모로 남겨보세요!'
          : '로그인하시면 클라우드에 나만의 메모를 안전하게 보관할 수 있습니다.';
      }
      return;
    }

    emptyState.style.display = 'none';

    if (currentCategory === 'all' && !searchQuery) {
      const pinnedList = filteredMemos.filter((m) => m.isPinned);
      const generalList = filteredMemos.filter((m) => !m.isPinned);

      if (pinnedList.length > 0) {
        pinnedSection.style.display = 'block';
        pinnedCountBadge.textContent = pinnedList.length;
        pinnedList.forEach((memo) => {
          pinnedContainer.appendChild(createMemoCardElement(memo));
        });

        if (generalList.length > 0) {
          generalTitleWrap.style.display = 'flex';
          generalCountBadge.textContent = generalList.length;
        } else {
          generalTitleWrap.style.display = 'none';
        }
      } else {
        pinnedSection.style.display = 'none';
        generalTitleWrap.style.display = 'none';
      }

      generalList.forEach((memo) => {
        memoContainer.appendChild(createMemoCardElement(memo));
      });
    } else {
      pinnedSection.style.display = 'none';
      generalTitleWrap.style.display = 'none';

      filteredMemos.forEach((memo) => {
        memoContainer.appendChild(createMemoCardElement(memo));
      });
    }
  }

  // =========================================================================
  // Checkbox Toggle in Memo Card
  // =========================================================================
  async function toggleChecklistLine(memoId, lineIdx, isChecked) {
    const memo = memos.find((m) => m.id === memoId);
    if (!memo) return;

    const lines = memo.content.split('\n');
    if (lineIdx >= 0 && lineIdx < lines.length) {
      if (isChecked) {
        lines[lineIdx] = lines[lineIdx].replace(/^-\s*\[\s*\]\s+/, '- [x] ');
      } else {
        lines[lineIdx] = lines[lineIdx].replace(/^-\s*\[x\]\s+/i, '- [ ] ');
      }
      const newContent = lines.join('\n');
      const now = Date.now();

      memo.content = newContent;
      memo.updatedAt = now;

      if (currentUser) {
        saveUserLocalBackup();
      } else {
        saveGuestLocalMemos();
      }
      renderApp();

      if (currentUser && isFirebaseConnected) {
        try {
          await updateDoc(doc(db, 'users', currentUser.uid, 'memos', memoId), {
            content: newContent,
            updatedAt: now
          });
        } catch (err) {
          console.warn('Firestore update error:', err);
        }
      }
    }
  }

  // =========================================================================
  // Pin & Clipboard & Download Actions
  // =========================================================================
  async function togglePinMemo(memoId) {
    const memo = memos.find((m) => m.id === memoId);
    if (!memo) return;

    const nextPinned = !memo.isPinned;
    const now = Date.now();
    memo.isPinned = nextPinned;
    memo.updatedAt = now;

    if (currentUser) {
      saveUserLocalBackup();
    } else {
      saveGuestLocalMemos();
    }
    renderApp();
    showToast(nextPinned ? '메모가 상단에 고정되었습니다.' : '메모 고정이 해제되었습니다.');

    if (currentUser && isFirebaseConnected) {
      try {
        await updateDoc(doc(db, 'users', currentUser.uid, 'memos', memoId), {
          isPinned: nextPinned,
          updatedAt: now
        });
      } catch (err) {
        console.warn('Firestore pin update error:', err);
      }
    }
  }

  function copyMemoToClipboard(memo) {
    const fullText = `${memo.title}\n\n${memo.content}`;
    navigator.clipboard
      .writeText(fullText)
      .then(() => {
        showToast('메모 내용이 클립보드에 복사되었습니다.');
      })
      .catch(() => {
        showToast('클립보드 복사에 실패했습니다.', 'error');
      });
  }

  function downloadSingleMemoMarkdown(memo) {
    const title = memo.title ? memo.title.replace(/[/\\?%*:|"<>]/g, '_') : 'memo';
    const content = `# ${memo.title}\n\n${memo.content}\n\n---\n*작성일: ${formatFullDateTime(memo.createdAt)}*`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('마크다운 파일로 다운로드되었습니다.');
  }

  // =========================================================================
  // Modal Handling (Create & Edit)
  // =========================================================================
  function requireLoginForMemo() {
    if (currentUser) return true;

    showToast('메모를 작성하려면 먼저 로그인해 주세요.', 'error');
    openAuthModal('login');
    return false;
  }

  function openCreateModal() {
    if (!requireLoginForMemo()) return;

    editMemoId.value = '';
    memoTitleInput.value = '';
    memoContentInput.value = '';
    dateInput.value = getDateInputValue(new Date());
    memoCategorySelect.value = currentCategory !== 'all' && currentCategory !== 'pinned' ? currentCategory : 'personal';
    modalTitle.textContent = '새 메모 작성';
    modalDateInfo.textContent = '지금 작성 중';
    modalIsPinned = false;
    modalSelectedColor = 'default';

    updateModalPinButton();
    updateModalColorPalette();
    updateCharWordCount();

    memoModal.showModal();
    memoTitleInput.focus();
  }

  function openEditModal(memoId) {
    if (!requireLoginForMemo()) return;

    const memo = memos.find((m) => m.id === memoId);
    if (!memo) return;

    editMemoId.value = memo.id;
    memoTitleInput.value = memo.title || '';
    memoContentInput.value = memo.content || '';
    dateInput.value = getDateInputValue(new Date());
    memoCategorySelect.value = memo.category || 'personal';
    modalTitle.textContent = '메모 수정';
    modalDateInfo.textContent = `작성일: ${formatFullDateTime(memo.createdAt)} · 최종 수정: ${formatRelativeDate(memo.updatedAt || memo.createdAt)}`;
    modalIsPinned = !!memo.isPinned;
    modalSelectedColor = memo.color || 'default';

    updateModalPinButton();
    updateModalColorPalette();
    updateCharWordCount();

    memoModal.showModal();
    memoTitleInput.focus();
  }

  function updateModalPinButton() {
    if (modalIsPinned) {
      modalPinBtn.classList.add('active');
      modalPinBtn.title = '상단 고정됨';
    } else {
      modalPinBtn.classList.remove('active');
      modalPinBtn.title = '상단 고정하기';
    }
  }

  function updateModalColorPalette() {
    const dots = colorPalette.querySelectorAll('.color-dot');
    dots.forEach((dot) => {
      if (dot.dataset.color === modalSelectedColor) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }

  function updateCharWordCount() {
    const text = memoContentInput.value || '';
    const charCount = text.length;
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    charWordCount.textContent = `${charCount}자 (${wordCount}단어)`;
  }

  function getDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDateForContent(value) {
    if (!value) return '';
    const [year, month, day] = value.split('-');
    return `${year}.${month}.${day}`;
  }

  function insertDateIntoContent(value) {
    const formattedDate = formatDateForContent(value);
    if (!formattedDate) return;

    const start = memoContentInput.selectionStart;
    const end = memoContentInput.selectionEnd;
    const text = memoContentInput.value;
    const prefix = start > 0 && text[start - 1] !== '\n' ? ' ' : '';
    const insertion = `${prefix}${formattedDate}`;
    memoContentInput.value = text.substring(0, start) + insertion + text.substring(end);
    const cursorPosition = start + insertion.length;
    memoContentInput.focus();
    memoContentInput.setSelectionRange(cursorPosition, cursorPosition);
    updateCharWordCount();
  }

  async function handleSaveMemo(e) {
    if (e) e.preventDefault();
    if (!requireLoginForMemo()) {
      memoModal.close();
      return;
    }

    const title = memoTitleInput.value.trim();
    const content = memoContentInput.value.trim();

    if (!title && !content) {
      showToast('메모 제목 또는 내용을 입력해주세요.', 'error');
      memoTitleInput.focus();
      return;
    }

    const id = editMemoId.value;
    const category = memoCategorySelect.value;
    const now = Date.now();

    if (id) {
      // Edit existing
      const memo = memos.find((m) => m.id === id);
      const updatedData = {
        title: title || '제목 없음',
        content: content,
        category: category,
        color: modalSelectedColor,
        isPinned: modalIsPinned,
        updatedAt: now
      };

      if (memo) {
        Object.assign(memo, updatedData);
      }

      if (currentUser) {
        saveUserLocalBackup();
      } else {
        saveGuestLocalMemos();
      }
      renderApp();

      if (currentUser && isFirebaseConnected) {
        try {
          await updateDoc(doc(db, 'users', currentUser.uid, 'memos', id), updatedData);
        } catch (err) {
          console.warn('Firestore update error:', err);
        }
      }
      showToast('메모가 수정되었습니다.');
    } else {
      // Create new
      const newId = 'memo-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
      const newMemo = {
        id: newId,
        title: title || '제목 없음',
        content: content,
        category: category,
        color: modalSelectedColor,
        isPinned: modalIsPinned,
        createdAt: now,
        updatedAt: now
      };

      memos.unshift(newMemo);

      if (currentUser) {
        saveUserLocalBackup();
      } else {
        saveGuestLocalMemos();
      }
      renderApp();

      if (currentUser && isFirebaseConnected) {
        try {
          await setDoc(doc(db, 'users', currentUser.uid, 'memos', newId), newMemo);
        } catch (err) {
          console.warn('Firestore create error:', err);
        }
      }
      showToast('새 메모가 등록되었습니다.');
    }

    memoModal.close();
  }

  // =========================================================================
  // Delete Memo & Undo Logic
  // =========================================================================
  function openDeleteConfirmModal(memoId) {
    if (!requireLoginForMemo()) return;
    pendingDeleteMemo = memos.find((m) => m.id === memoId);
    if (!pendingDeleteMemo) return;
    deleteModal.showModal();
  }

  async function confirmDelete() {
    if (!pendingDeleteMemo) return;

    const targetId = pendingDeleteMemo.id;
    lastDeletedMemo = { ...pendingDeleteMemo };
    const trashedMemo = { ...pendingDeleteMemo, deletedAt: Date.now() };
    memos = memos.filter((m) => m.id !== targetId);
    trashMemos.unshift(trashedMemo);
    pendingDeleteMemo = null;

    if (currentUser) {
      saveUserLocalBackup();
      saveTrashLocalBackup();
    } else {
      saveGuestLocalMemos();
    }
    renderApp();
    deleteModal.close();

    if (currentUser && isFirebaseConnected) {
      try {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'memos', targetId));
        await setDoc(doc(db, 'users', currentUser.uid, 'trash', targetId), trashedMemo);
      } catch (err) {
        console.warn('Firestore delete error:', err);
      }
    }

    showToastWithUndo('메모가 삭제되었습니다.', async () => {
      if (lastDeletedMemo) {
        memos.unshift(lastDeletedMemo);
        trashMemos = trashMemos.filter((memo) => memo.id !== lastDeletedMemo.id);
        if (currentUser) {
          saveUserLocalBackup();
          saveTrashLocalBackup();
        } else {
          saveGuestLocalMemos();
        }
        renderApp();

        if (currentUser && isFirebaseConnected) {
          try {
            await setDoc(doc(db, 'users', currentUser.uid, 'memos', lastDeletedMemo.id), lastDeletedMemo);
            await deleteDoc(doc(db, 'users', currentUser.uid, 'trash', lastDeletedMemo.id));
          } catch (err) {
            console.warn('Firestore restore error:', err);
          }
        }

        lastDeletedMemo = null;
        showToast('삭제가 취소되고 복원되었습니다.');
      }
    });
  }

  async function restoreMemo(memoId) {
    const memo = trashMemos.find((item) => item.id === memoId);
    if (!memo || !currentUser) return;

    const restoredMemo = { ...memo };
    delete restoredMemo.deletedAt;
    trashMemos = trashMemos.filter((item) => item.id !== memoId);
    memos.unshift(restoredMemo);
    saveUserLocalBackup();
    saveTrashLocalBackup();
    renderApp();

    if (isFirebaseConnected) {
      try {
        await setDoc(doc(db, 'users', currentUser.uid, 'memos', memoId), restoredMemo);
        await deleteDoc(doc(db, 'users', currentUser.uid, 'trash', memoId));
      } catch (err) {
        console.warn('Firestore restore error:', err);
      }
    }
    showToast('메모가 복원되었습니다.');
  }

  async function permanentlyDeleteMemo(memoId) {
    if (!currentUser || !confirm('이 메모를 영구적으로 삭제하시겠습니까?')) return;

    trashMemos = trashMemos.filter((item) => item.id !== memoId);
    saveTrashLocalBackup();
    renderApp();

    if (isFirebaseConnected) {
      try {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'trash', memoId));
      } catch (err) {
        console.warn('Firestore permanent delete error:', err);
      }
    }
    showToast('메모가 영구 삭제되었습니다.');
  }

  // =========================================================================
  // Authentication Handlers
  // =========================================================================
  function openAuthModal(mode = 'login') {
    authMode = mode;
    updateAuthModalTabs();
    authErrorAlert.style.display = 'none';
    authEmail.value = '';
    authPassword.value = '';
    authModal.showModal();
    authEmail.focus();
  }

  function updateAuthModalTabs() {
    if (authMode === 'login') {
      tabLogin.classList.add('active');
      tabSignup.classList.remove('active');
      authModalTitle.textContent = '로그인';
      btnAuthSubmit.querySelector('span').textContent = '로그인하기';
    } else {
      tabLogin.classList.remove('active');
      tabSignup.classList.add('active');
      authModalTitle.textContent = '계정 만들기';
      btnAuthSubmit.querySelector('span').textContent = '회원가입하기';
    }
  }

  function showAuthError(message) {
    authErrorAlert.textContent = message;
    authErrorAlert.style.display = 'block';
  }

  function getFriendlyAuthErrorMessage(errorCode) {
    switch (errorCode) {
      case 'auth/invalid-email':
        return '유효하지 않은 이메일 형식입니다.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return '이메일 또는 비밀번호가 일치하지 않습니다.';
      case 'auth/email-already-in-use':
        return '이미 사용 중인 이메일 계정입니다. 로그인을 시도해 주세요.';
      case 'auth/weak-password':
        return '비밀번호는 최소 6자 이상이어야 합니다.';
      case 'auth/popup-closed-by-user':
        return 'Google 로그인 창이 닫혔습니다.';
      case 'auth/unauthorized-domain':
        return 'Firebase 콘솔에서 이 도메인(localhost)이 승인되지 않았습니다. Authentication > Settings > Authorized domains를 확인하세요.';
      case 'auth/operation-not-allowed':
        return '해당 로그인 방법이 Firebase 콘솔에서 아직 활성화되지 않았습니다. Authentication > Sign-in method에서 활성화해 주세요.';
      case 'auth/configuration-not-found':
        return 'Firebase Authentication이 아직 설정되지 않았습니다. Firebase 콘솔의 Authentication > Get started에서 인증을 시작하고 사용할 로그인 방법을 활성화해 주세요.';
      default:
        return '로그인 처리 중 오류가 발생했습니다: ' + errorCode;
    }
  }

  async function handleGoogleLogin() {
    authErrorAlert.style.display = 'none';
    try {
      const result = await signInWithPopup(auth, googleProvider);
      authModal.close();
      const name = result.user.displayName || '사용자';
      showToast(`${name}님, 환영합니다!`);
    } catch (err) {
      console.error('Google 로그인 오류:', err);
      showAuthError(getFriendlyAuthErrorMessage(err.code));
    }
  }

  async function handleEmailAuthSubmit(e) {
    e.preventDefault();
    authErrorAlert.style.display = 'none';

    const email = authEmail.value.trim();
    const password = authPassword.value;

    if (!email || !password) {
      showAuthError('이메일과 비밀번호를 모두 입력해 주세요.');
      return;
    }

    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
        authModal.close();
        showToast('로그인되었습니다.');
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        authModal.close();
        showToast('성공적으로 회원가입되었습니다!');
      }
    } catch (err) {
      console.error('이메일 인증 오류:', err);
      showAuthError(getFriendlyAuthErrorMessage(err.code));
    }
  }

  async function handleGuestLogin() {
    authErrorAlert.style.display = 'none';
    try {
      await signInAnonymously(auth);
      authModal.close();
      showToast('게스트로 로그인되었습니다.');
    } catch (err) {
      console.error('게스트 로그인 오류:', err);
      showAuthError(getFriendlyAuthErrorMessage(err.code));
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      closeUserDropdown();
      showToast('로그아웃되었습니다.');
    } catch (err) {
      console.error('로그아웃 오류:', err);
      showToast('로그아웃 실패: ' + err.message, 'error');
    }
  }

  function closeUserDropdown() {
    if (userProfileWrapper) {
      userProfileWrapper.classList.remove('open');
    }
  }

  // =========================================================================
  // Light Dismiss Dialog Fallback (Web Standards)
  // =========================================================================
  function setupDialogBackdropFallback(dialog) {
    if (!dialog) return;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      });
    }
  }

  // =========================================================================
  // Editor Toolbar Insertion Helpers
  // =========================================================================
  function insertFormatting(action) {
    const textarea = memoContentInput;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);

    let replacement = '';
    let cursorOffset = 0;

    switch (action) {
      case 'bold':
        replacement = `**${selected || '텍스트'}**`;
        cursorOffset = selected ? replacement.length : 2;
        break;
      case 'italic':
        replacement = `*${selected || '텍스트'}*`;
        cursorOffset = selected ? replacement.length : 1;
        break;
      case 'heading':
        replacement = `\n# ${selected || '제목'}\n`;
        cursorOffset = replacement.length;
        break;
      case 'todo':
        replacement = `\n- [ ] ${selected || '할 일 입력'}`;
        cursorOffset = replacement.length;
        break;
      case 'bullet':
        replacement = `\n- ${selected || '항목'}`;
        cursorOffset = replacement.length;
        break;
      case 'code':
        replacement = `\`${selected || '코드'}\``;
        cursorOffset = selected ? replacement.length : 1;
        break;
    }

    textarea.value = text.substring(0, start) + replacement + text.substring(end);
    textarea.focus();
    textarea.setSelectionRange(start + cursorOffset, start + cursorOffset);
    updateCharWordCount();
  }

  // =========================================================================
  // Backup & Restore (JSON Export / Import)
  // =========================================================================
  function exportMemosJson() {
    const dataStr = JSON.stringify(memos, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    const userPrefix = currentUser ? (currentUser.displayName || currentUser.email || 'user') + '-' : '';
    a.href = url;
    a.download = `memohub-${userPrefix}backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('전체 메모가 JSON 파일로 백업되었습니다.');
    closeMenuDropdown();
  }

  function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
      try {
        const importedData = JSON.parse(e.target.result);
        if (!Array.isArray(importedData)) {
          throw new Error('올바른 메모 데이터 배열 형식이 아닙니다.');
        }

        const confirmReplace = confirm(
          `가져온 파일에 ${importedData.length}개의 메모가 있습니다.\n` +
          `[확인]: 기존 메모와 병합(추가)합니다.\n` +
          `[취소]: 작업을 중단합니다.`
        );

        if (confirmReplace) {
          const existingIds = new Set(memos.map((m) => m.id));
          for (const item of importedData) {
            if (!item.id || existingIds.has(item.id)) {
              item.id = 'memo-imported-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
            }
            memos.push(item);
            if (currentUser && isFirebaseConnected) {
              setDoc(doc(db, 'users', currentUser.uid, 'memos', item.id), item).catch((err) => console.warn(err));
            }
          }

          if (currentUser) {
            saveUserLocalBackup();
          } else {
            saveGuestLocalMemos();
          }
          renderApp();
          showToast(`${importedData.length}개의 메모를 성공적으로 복원했습니다.`);
        }
      } catch (err) {
        alert('파일을 읽는 중 오류가 발생했습니다: ' + err.message);
      }
      importFileInput.value = '';
      closeMenuDropdown();
    };
    reader.readAsText(file);
  }

  async function clearAllMemos() {
    if (!requireLoginForMemo()) return;
    if (confirm('모든 메모를 휴지통으로 이동하시겠습니까? 7일 후 자동으로 영구 삭제됩니다.')) {
      const deletedAt = Date.now();
      const trashedMemos = memos.map((memo) => ({ ...memo, deletedAt }));
      memos = [];
      trashMemos = [...trashedMemos, ...trashMemos];

      if (currentUser) {
        saveUserLocalBackup();
        saveTrashLocalBackup();
      }
      renderApp();

      if (currentUser && isFirebaseConnected) {
        for (const memo of trashedMemos) {
          deleteDoc(doc(db, 'users', currentUser.uid, 'memos', memo.id)).catch((err) => console.warn(err));
          setDoc(doc(db, 'users', currentUser.uid, 'trash', memo.id), memo).catch((err) => console.warn(err));
        }
      }

      showToast('모든 메모가 휴지통으로 이동되었습니다.');
      closeMenuDropdown();
    }
  }

  function closeMenuDropdown() {
    if (btnMenu && btnMenu.parentElement) {
      btnMenu.parentElement.classList.remove('open');
    }
  }

  // =========================================================================
  // Toast Notifications
  // =========================================================================
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        ${type === 'error'
          ? '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'
          : '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'}
      </svg>
      <span>${escapeHtml(message)}</span>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px) scale(0.95)';
      setTimeout(() => toast.remove(), 200);
    }, 3200);
  }

  function showToastWithUndo(message, onUndo) {
    if (undoTimeout) clearTimeout(undoTimeout);

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <span>${escapeHtml(message)}</span>
      <button type="button" class="toast-btn-undo" id="btnToastUndo">실행 취소</button>
    `;

    toastContainer.appendChild(toast);

    const btnUndo = toast.querySelector('#btnToastUndo');
    btnUndo.addEventListener('click', () => {
      onUndo();
      toast.remove();
    });

    undoTimeout = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px) scale(0.95)';
      setTimeout(() => toast.remove(), 200);
    }, 5000);
  }

  // =========================================================================
  // Theme Toggle
  // =========================================================================
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('memo-theme', next);

    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.content = next;

    showToast(next === 'dark' ? '다크 모드가 적용되었습니다.' : '라이트 모드가 적용되었습니다.');
  }

  function updateViewToggleButtons() {
    if (viewMode === 'grid') {
      btnGridView.classList.add('active');
      btnListView.classList.remove('active');
    } else {
      btnGridView.classList.remove('active');
      btnListView.classList.add('active');
    }
  }

  // =========================================================================
  // Event Listeners Setup
  // =========================================================================
  function setupEventListeners() {
    // Auth Trigger
    btnLoginTrigger.addEventListener('click', () => openAuthModal('login'));
    authCloseBtn.addEventListener('click', () => authModal.close());
    btnGoogleLogin.addEventListener('click', handleGoogleLogin);
    btnGuestLogin.addEventListener('click', handleGuestLogin);
    authForm.addEventListener('submit', handleEmailAuthSubmit);

    tabLogin.addEventListener('click', () => {
      authMode = 'login';
      updateAuthModalTabs();
    });

    tabSignup.addEventListener('click', () => {
      authMode = 'signup';
      updateAuthModalTabs();
    });

    // Profile Dropdown
    userAvatarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userProfileWrapper.classList.toggle('open');
    });

    btnLogout.addEventListener('click', handleLogout);

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.user-profile-wrapper')) {
        closeUserDropdown();
      }
    });

    // New memo buttons
    btnNewMemo.addEventListener('click', openCreateModal);
    btnEmptyCreate.addEventListener('click', openCreateModal);
    fabBtn.addEventListener('click', openCreateModal);

    modalCloseBtn.addEventListener('click', () => memoModal.close());
    btnCancelModal.addEventListener('click', () => memoModal.close());
    deleteCloseBtn.addEventListener('click', () => deleteModal.close());
    btnCancelDelete.addEventListener('click', () => deleteModal.close());
    btnConfirmDelete.addEventListener('click', confirmDelete);

    memoForm.addEventListener('submit', handleSaveMemo);

    const toolbarBtns = document.querySelectorAll('.toolbar-btn');
    toolbarBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        insertFormatting(btn.dataset.action);
      });
    });

    memoContentInput.addEventListener('input', updateCharWordCount);

    btnInsertToday.addEventListener('click', () => {
      insertDateIntoContent(getDateInputValue(new Date()));
    });

    btnInsertSelectedDate.addEventListener('click', () => {
      insertDateIntoContent(dateInput.value);
    });

    modalPinBtn.addEventListener('click', () => {
      modalIsPinned = !modalIsPinned;
      updateModalPinButton();
    });

    const colorDots = colorPalette.querySelectorAll('.color-dot');
    colorDots.forEach((dot) => {
      dot.addEventListener('click', () => {
        modalSelectedColor = dot.dataset.color;
        updateModalColorPalette();
      });
    });

    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      if (searchQuery) {
        btnClearSearch.style.display = 'flex';
        searchKbdHint.style.display = 'none';
      } else {
        btnClearSearch.style.display = 'none';
        searchKbdHint.style.display = 'block';
      }
      renderApp();
    });

    btnClearSearch.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      btnClearSearch.style.display = 'none';
      searchKbdHint.style.display = 'block';
      searchInput.focus();
      renderApp();
    });

    sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      localStorage.setItem('memo-sort-order', currentSort);
      renderApp();
    });

    btnGridView.addEventListener('click', () => {
      viewMode = 'grid';
      localStorage.setItem('memo-view-mode', 'grid');
      updateViewToggleButtons();
      renderApp();
    });

    btnListView.addEventListener('click', () => {
      viewMode = 'list';
      localStorage.setItem('memo-view-mode', 'list');
      updateViewToggleButtons();
      renderApp();
    });

    categoryPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        categoryPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        currentCategory = pill.dataset.category;
        renderApp();
      });
    });

    themeToggleBtn.addEventListener('click', toggleTheme);

    btnMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      btnMenu.parentElement.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.dropdown-wrapper')) {
        closeMenuDropdown();
      }
    });

    btnExportJson.addEventListener('click', exportMemosJson);
    btnImportJson.addEventListener('click', () => {
      importFileInput.click();
    });
    importFileInput.addEventListener('change', handleImportFile);
    btnClearAll.addEventListener('click', clearAllMemos);

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        openCreateModal();
        return;
      }

      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
        return;
      }

      if (e.key === 'Escape') {
        closeMenuDropdown();
        closeUserDropdown();
      }
    });
  }

  // =========================================================================
  // Bootstrap
  // =========================================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
