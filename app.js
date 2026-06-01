import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const COMMENT_HINT =
  "この炎上事例に対する自分の考えを書こう。すぐに結論を決めきらず、あえてもやもやが残るような論調にしてみよう。";

const firebaseConfig = {
  apiKey: "AIzaSyAP_QLFmabHHqmqMDUsYBCTEUqISmHkTos",
  authDomain: "snsbunseki-5834c.firebaseapp.com",
  projectId: "snsbunseki-5834c",
  storageBucket: "snsbunseki-5834c.firebasestorage.app",
  messagingSenderId: "516936944394",
  appId: "1:516936944394:web:0055bb3b175e0566f148f3",
  measurementId: "G-57K78Y9TG1",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let activeGroupFilter = "ALL";
let activeClassFilter = "A";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function excerpt(value, length = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function toDate(value) {
  if (!value) {
    return new Date();
  }
  if (typeof value.toDate === "function") {
    return value.toDate();
  }
  return new Date(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(toDate(value));
}

function renderTemplate(id) {
  const appRoot = document.querySelector("#app");
  const template = document.querySelector(id);
  appRoot.replaceChildren(template.content.cloneNode(true));
}

function avatarText(author) {
  return String(author || "?").slice(0, 2);
}

function avatarMarkup(author, iconUrl, extraClass = "") {
  const classes = ["avatar", extraClass, iconUrl ? "has-icon" : ""].filter(Boolean).join(" ");
  if (iconUrl) {
    return `<span class="${classes}"><img src="${escapeHtml(iconUrl)}" alt="${escapeHtml(author)}のアイコン" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove();"></span>`;
  }
  return `<span class="${classes}">${escapeHtml(avatarText(author))}</span>`;
}

function classLetter(author) {
  return String(author || "").toUpperCase().match(/^1([A-H])[0-9]{2}$/)?.[1] || "";
}

function caseGroup(caseItem) {
  return String(caseItem.group || "1");
}

function caseOccurrence(caseItem) {
  return caseItem.occurrenceDate || "未設定";
}

function caseParties(caseItem) {
  return caseItem.parties || "未設定";
}

function normalizeCase(id, data, comments = []) {
  return {
    id,
    title: data.title || "",
    occurrenceDate: data.occurrenceDate || "",
    parties: data.parties || "",
    author: data.author || "",
    authorIcon: data.authorIcon || "",
    group: data.group || "1",
    summary: data.summary || "",
    analysisFactEmotion: data.analysisFactEmotion || "",
    analysisBias: data.analysisBias || "",
    analysisPressure: data.analysisPressure || "",
    comments,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || data.createdAt || new Date().toISOString(),
  };
}

async function loadComments(postId) {
  const commentQuery = query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"));
  const snapshot = await getDocs(commentQuery);
  return snapshot.docs.map((commentDoc) => ({
    id: commentDoc.id,
    ...commentDoc.data(),
    createdAt: commentDoc.data().createdAt || new Date().toISOString(),
  }));
}

async function loadCases() {
  const postsQuery = query(collection(db, "posts"), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(postsQuery);
  return Promise.all(snapshot.docs.map(async (postDoc) => normalizeCase(postDoc.id, postDoc.data(), await loadComments(postDoc.id))));
}

async function loadCase(id) {
  const snapshot = await getDoc(doc(db, "posts", id));
  if (!snapshot.exists()) {
    return null;
  }
  return normalizeCase(snapshot.id, snapshot.data(), await loadComments(snapshot.id));
}

function postPayloadFromForm(form) {
  const data = new FormData(form);
  return {
    title: data.get("title").trim(),
    occurrenceDate: data.get("occurrenceDate").trim(),
    parties: data.get("parties").trim(),
    author: data.get("author").trim().toUpperCase(),
    authorIcon: data.get("authorIcon").trim(),
    group: data.get("group"),
    summary: data.get("summary").trim(),
    analysisFactEmotion: data.get("analysisFactEmotion").trim(),
    analysisBias: data.get("analysisBias").trim(),
    analysisPressure: data.get("analysisPressure").trim(),
  };
}

async function saveUserIcon(author, authorIcon) {
  if (!author || !authorIcon) {
    return;
  }
  try {
    await setDoc(doc(db, "userIcons", author), { author, authorIcon, updatedAt: serverTimestamp() }, { merge: true });
  } catch (error) {
    console.warn("User icon could not be saved.", error);
  }
}

async function getUserIcon(author) {
  try {
    const snapshot = await getDoc(doc(db, "userIcons", author));
    return snapshot.exists() ? snapshot.data().authorIcon || "" : "";
  } catch (error) {
    console.warn("User icon could not be loaded.", error);
    return "";
  }
}

async function createCase(payload) {
  await saveUserIcon(payload.author, payload.authorIcon);
  const created = await addDoc(collection(db, "posts"), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return created.id;
}

async function updateCase(id, payload) {
  await saveUserIcon(payload.author, payload.authorIcon);
  await updateDoc(doc(db, "posts", id), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
}

async function addComment(postId, payload) {
  const author = payload.author.trim().toUpperCase();
  await addDoc(collection(db, "posts", postId, "comments"), {
    author,
    authorIcon: await getUserIcon(author),
    body: payload.body.trim(),
    createdAt: serverTimestamp(),
  });
}

async function renderHome() {
  renderTemplate("#home-template");
  const cases = await loadCases();
  const list = document.querySelector("#caseList");
  const searchInput = document.querySelector("#searchInput");
  const feedTitle = document.querySelector("#feedTitle");
  const promotedPost = document.querySelector(".promoted-goal-post");
  updateSideNavActive();
  updateClassTabsActive();
  document.querySelectorAll(".feed-tab[data-class-filter]").forEach((tab) => {
    tab.addEventListener("click", () => {
      activeClassFilter = tab.dataset.classFilter || "A";
      updateClassTabsActive();
      paint(searchInput.value);
    });
  });

  const paint = (query = "") => {
    const normalized = query.trim().toLowerCase();
    const groupLabel = activeGroupFilter === "ALL" ? "ALL" : `${activeGroupFilter}班`;
    feedTitle.textContent = `${activeClassFilter}組 / ${groupLabel}`;
    promotedPost.hidden = !(activeClassFilter === "A" && activeGroupFilter === "ALL");
    const filtered = cases
      .filter((item) => classLetter(item.author) === activeClassFilter)
      .filter((item) => activeGroupFilter === "ALL" || caseGroup(item) === activeGroupFilter)
      .filter((item) => {
        const haystack = [
          item.title,
          item.author,
          `${caseGroup(item)}班`,
          item.occurrenceDate,
          item.parties,
          item.summary,
          item.analysisFactEmotion,
          item.analysisBias,
          item.analysisPressure,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalized);
      });

    if (filtered.length === 0) {
      const groupPart = activeGroupFilter === "ALL" ? "" : `${activeGroupFilter}班の`;
      const label = `${activeClassFilter}組の${groupPart}事例`;
      list.innerHTML = `<div class="empty-state">${label}はありません。新しい視点を投稿してみましょう。</div>`;
      return;
    }

    list.innerHTML = filtered
      .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))
      .map(
        (item) => `
          <a class="tweet-card" href="#/case/${item.id}" aria-label="${escapeHtml(item.title)}の詳細を見る">
            ${avatarMarkup(item.author, item.authorIcon)}
            <div class="tweet-body">
              <div class="tweet-meta">
                <strong>${escapeHtml(item.author)}</strong>
                <span>${escapeHtml(caseGroup(item))}班</span>
                <span>@analysis</span>
                <span>・</span>
                <time>${formatDate(item.createdAt)}</time>
              </div>
              <h3>${escapeHtml(item.title)}</h3>
              <dl class="case-brief">
                <div>
                  <dt>発生時期</dt>
                  <dd>${escapeHtml(caseOccurrence(item))}</dd>
                </div>
                <div>
                  <dt>当事者</dt>
                  <dd>${escapeHtml(caseParties(item))}</dd>
                </div>
                <div>
                  <dt>概要</dt>
                  <dd>${escapeHtml(excerpt(item.summary, 150))}</dd>
                </div>
              </dl>
            </div>
          </a>
        `,
      )
      .join("");
  };

  searchInput.addEventListener("input", (event) => paint(event.target.value));
  paint();
}

function setField(form, name, value) {
  const field = form.elements[name];
  if (field) {
    field.value = value || "";
  }
}

function setIconSelection(form, value) {
  const icon = value || "assets/icons/icon-01.svg";
  const input = form.querySelector(`input[name="authorIcon"][value="${CSS.escape(icon)}"]`);
  if (input) {
    input.checked = true;
  }
}

async function renderForm(id = null) {
  renderTemplate("#form-template");
  const form = document.querySelector("#caseForm");
  const title = document.querySelector(".form-page .feed-header h2");
  const subtitle = document.querySelector(".form-page .feed-header p");
  const submitButton = form.querySelector('button[type="submit"]');
  let existing = null;

  if (id) {
    existing = await loadCase(id);
    if (!existing) {
      document.querySelector("#app").innerHTML =
        '<section class="not-found"><h2>事例が見つかりません</h2><p>一覧に戻って、登録されている事例を確認してください。</p><a class="primary-action" href="#/">一覧へ戻る</a></section>';
      return;
    }
    title.textContent = "投稿を編集";
    subtitle.textContent = "内容を修正して更新します。";
    submitButton.textContent = "更新する";
    setField(form, "title", existing.title);
    setField(form, "author", existing.author);
    setField(form, "group", existing.group);
    setField(form, "occurrenceDate", existing.occurrenceDate);
    setField(form, "parties", existing.parties);
    setField(form, "summary", existing.summary);
    setField(form, "analysisFactEmotion", existing.analysisFactEmotion);
    setField(form, "analysisBias", existing.analysisBias);
    setField(form, "analysisPressure", existing.analysisPressure);
    setIconSelection(form, existing.authorIcon);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = postPayloadFromForm(form);
    if (id) {
      await updateCase(id, payload);
      location.hash = `#/case/${id}`;
      return;
    }
    const newId = await createCase(payload);
    location.hash = `#/case/${newId}`;
  });
}

function analysisSection(label, title, body) {
  return `
    <section class="analysis-section">
      <span>${label}</span>
      <h3>${title}</h3>
      <p>${escapeHtml(body)}</p>
    </section>
  `;
}

async function renderDetail(id) {
  renderTemplate("#detail-template");
  const item = await loadCase(id);
  const detail = document.querySelector("#detailView");

  if (!item) {
    detail.innerHTML = `
      <section class="not-found">
        <h2>事例が見つかりません</h2>
        <p>一覧に戻って、登録されている事例を確認してください。</p>
        <a class="primary-action" href="#/">一覧へ戻る</a>
      </section>
    `;
    return;
  }

  detail.innerHTML = `
    <section class="tweet-detail">
      <a class="back-link" href="#/">← タイムラインへ戻る</a>
      <div class="tweet-card detail-tweet">
        ${avatarMarkup(item.author, item.authorIcon)}
        <div class="tweet-body">
          <div class="tweet-meta">
            <strong>${escapeHtml(item.author)}</strong>
            <span>${escapeHtml(caseGroup(item))}班</span>
            <span>@analysis</span>
            <span>・</span>
            <time>${formatDate(item.createdAt)}</time>
          </div>
          <h2>${escapeHtml(item.title)}</h2>
          <dl class="case-brief detail-brief">
            <div>
              <dt>発生時期</dt>
              <dd>${escapeHtml(caseOccurrence(item))}</dd>
            </div>
            <div>
              <dt>当事者</dt>
              <dd>${escapeHtml(caseParties(item))}</dd>
            </div>
            <div>
              <dt>概要</dt>
              <dd>${escapeHtml(item.summary)}</dd>
            </div>
          </dl>
          <div class="detail-actions">
            <a class="secondary-action" href="#/edit/${item.id}">編集する</a>
          </div>
        </div>
      </div>
      <div class="analysis-thread">
        ${analysisSection("感情的な反応", "感情的な反応", item.analysisFactEmotion)}
        ${analysisSection("分析", "確証バイアス / ナラティブ", item.analysisBias)}
        ${analysisSection("考察", "同調圧力 / 排除", item.analysisPressure)}
      </div>
    </section>

    <aside class="comments-panel" aria-label="社会的対話">
      <div>
        <p class="rail-eyebrow">社会的対話</p>
        <h2>コメント</h2>
        <p class="excerpt">${item.comments.length} 件の返信</p>
      </div>
      <form id="commentForm" class="comment-form">
        <label>
          <span>名前</span>
          <input name="author" required maxlength="4" pattern="1[A-Ha-h][0-9]{2}" placeholder="例：1A27" />
        </label>
        <label>
          <span>自分の考え</span>
          <textarea name="body" required rows="5" placeholder="${COMMENT_HINT}"></textarea>
        </label>
        <button class="primary-action" type="submit">返信する</button>
      </form>
      <div id="commentList" class="comment-list"></div>
    </aside>
  `;

  paintComments(item);

  document.querySelector("#commentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await addComment(id, {
      author: data.get("author"),
      body: data.get("body"),
    });
    form.reset();
    await renderDetail(id);
  });
}

function paintComments(item) {
  const list = document.querySelector("#commentList");
  if (item.comments.length === 0) {
    list.innerHTML = '<div class="empty-state">まだ返信はありません。</div>';
    return;
  }

  list.innerHTML = item.comments
    .slice()
    .reverse()
    .map(
      (comment) => `
        <article class="reply-card">
          ${avatarMarkup(comment.author, comment.authorIcon, "small-avatar")}
          <div>
            <div class="tweet-meta">
              <strong>${escapeHtml(comment.author)}</strong>
              <span>・</span>
              <time>${formatDate(comment.createdAt)}</time>
            </div>
            <p>${escapeHtml(comment.body)}</p>
          </div>
        </article>
      `,
    )
    .join("");
}

function updateSideNavActive() {
  document.querySelectorAll(".side-link[data-group-filter]").forEach((link) => {
    link.classList.toggle("active", link.dataset.groupFilter === activeGroupFilter);
  });
}

function updateClassTabsActive() {
  document.querySelectorAll(".feed-tab[data-class-filter]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.classFilter === activeClassFilter);
  });
}

function setupGroupFilters() {
  document.querySelectorAll(".side-link[data-group-filter]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      activeGroupFilter = link.dataset.groupFilter || "ALL";
      updateSideNavActive();
      if (location.hash !== "#/" && location.hash !== "#") {
        location.hash = "#/";
      } else {
        route();
      }
    });
  });
}

async function route() {
  const hash = location.hash || "#/";
  const detailMatch = hash.match(/^#\/case\/(.+)$/);
  const editMatch = hash.match(/^#\/edit\/(.+)$/);

  try {
    if (hash === "#/" || hash === "#") {
      await renderHome();
    } else if (hash === "#/new") {
      await renderForm();
    } else if (editMatch) {
      await renderForm(editMatch[1]);
    } else if (detailMatch) {
      await renderDetail(detailMatch[1]);
    } else {
      location.hash = "#/";
    }
  } catch (error) {
    console.error(error);
    document.querySelector("#app").innerHTML =
      '<section class="not-found"><h2>読み込みに失敗しました</h2><p>Firebaseの設定やFirestoreルールを確認してから、再読み込みしてください。</p></section>';
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", () => {
  setupGroupFilters();
  route();
});
