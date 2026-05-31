const CLASS_CODE_KEY = "kokugo-sns-analysis-class-code";
const COMMENT_HINT = "この炎上事例に対する自分の考えを書こう。すぐに結論を決めきらず、あえてもやもやが残るような論調にしてみよう。";

let uploadedImage = "";
let activeGroupFilter = "ALL";
let activeClassFilter = "A";

function getClassCode() {
  return sessionStorage.getItem(CLASS_CODE_KEY) || "kokugo2026";
}

function setClassCode(value) {
  sessionStorage.setItem(CLASS_CODE_KEY, value);
}

function bootstrapClassCodeFromUrl() {
  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  if (!code) {
    return;
  }

  setClassCode(code);
  url.searchParams.delete("code");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash || "#/"}`);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Class-Code": getClassCode(),
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function excerpt(value, length = 120) {
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function renderTemplate(id) {
  const app = document.querySelector("#app");
  const template = document.querySelector(id);
  app.replaceChildren(template.content.cloneNode(true));
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

function imageBlock(caseItem, className) {
  if (caseItem.image) {
    return `<div class="${className}"><img src="${caseItem.image}" alt="${escapeHtml(caseItem.title)}の参考画像"></div>`;
  }

  return "";
}

async function renderHome() {
  renderTemplate("#home-template");
  const cases = await api("/api/cases");
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
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(
        (item) => `
          <a class="tweet-card" href="#/case/${item.id}" aria-label="${escapeHtml(item.title)}の詳細を見る">
            ${avatarMarkup(item.author, item.authorIcon)}
            <div class="tweet-body">
              <div class="tweet-meta">
                <strong>${escapeHtml(item.author)}</strong>
                <span>${escapeHtml(caseGroup(item))}班</span>
                <span>@analysis</span>
                <span>·</span>
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
              ${imageBlock(item, "tweet-image")}
            </div>
          </a>
        `,
      )
      .join("");
  };

  searchInput.addEventListener("input", (event) => paint(event.target.value));
  paint();
}

function renderForm() {
  uploadedImage = "";
  renderTemplate("#form-template");
  const form = document.querySelector("#caseForm");
  const imageInput = document.querySelector("#imageInput");
  const preview = document.querySelector("#imagePreview");
  const previewImage = preview.querySelector("img");

  imageInput.addEventListener("change", () => {
    const file = imageInput.files?.[0];
    if (!file) {
      uploadedImage = "";
      preview.classList.add("hidden");
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      uploadedImage = reader.result;
      previewImage.src = uploadedImage;
      preview.classList.remove("hidden");
    });
    reader.readAsDataURL(file);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const newCase = await api("/api/cases", {
      method: "POST",
      body: JSON.stringify({
        title: data.get("title").trim(),
        occurrenceDate: data.get("occurrenceDate").trim(),
        parties: data.get("parties").trim(),
        author: data.get("author").trim().toUpperCase(),
        authorIcon: data.get("authorIcon").trim(),
        group: data.get("group"),
        image: uploadedImage,
        summary: data.get("summary").trim(),
        analysisFactEmotion: data.get("analysisFactEmotion").trim(),
        analysisBias: data.get("analysisBias").trim(),
        analysisPressure: data.get("analysisPressure").trim(),
      }),
    });
    location.hash = `#/case/${newCase.id}`;
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
  const item = await api(`/api/cases/${id}`);
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
            <span>·</span>
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
          ${imageBlock(item, "tweet-image detail-image")}
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
    await api(`/api/cases/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({
        author: data.get("author").trim().toUpperCase(),
        body: data.get("body").trim(),
      }),
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
              <span>·</span>
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

  try {
    if (hash === "#/" || hash === "#") {
      await renderHome();
    } else if (hash === "#/new") {
      renderForm();
    } else if (detailMatch) {
      await renderDetail(detailMatch[1]);
    } else {
      location.hash = "#/";
    }
  } catch (error) {
    if (error.message !== "Unauthorized") {
      document.querySelector("#app").innerHTML =
        '<section class="not-found"><h2>読み込みに失敗しました</h2><p>サーバーを起動してから再読み込みしてください。</p></section>';
    }
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", () => {
  bootstrapClassCodeFromUrl();
  setupGroupFilters();
  route();
});
