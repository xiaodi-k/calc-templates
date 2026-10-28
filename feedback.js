/* Public GitHub Issues are the shared source of truth. Writes happen on GitHub,
   which authenticates authors and enforces moderation permissions. No tokens. */
(() => {
  'use strict';
  const repository = 'xiaodi-k/calc-templates';
  // Only explicitly designated GitHub accounts receive the administrator badge.
  // Repository collaborators are not necessarily administrators.
  const administrators = new Set(['xiaodi-k']);
  const github = `https://github.com/${repository}`;
  const api = `https://api.github.com/repos/${repository}`;
  const list = document.getElementById('feedback-list');
  const status = document.getElementById('feedback-status');
  const count = document.getElementById('feedback-count');
  const refresh = document.getElementById('feedback-refresh');
  if (!list || !status || !count || !refresh) return;

  let busy = false;
  let hasLoaded = false;
  let lastAttempt = 0;
  let returnPending = false;
  const commentCache = new Map();
  const dayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function externalLink(text, url, className) {
    const link = el('a', className, text);
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }

  function time(value, short = false) {
    const node = el('time', 'feedback-date');
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) {
      node.textContent = '日期未知';
      return node;
    }
    node.dateTime = date.toISOString();
    node.textContent = (short ? dayFormat : timeFormat).format(date);
    node.title = `${timeFormat.format(date)}（北京时间）`;
    return node;
  }

  function bodyOf(item) {
    // The text media type removes Markdown markup; textContent still treats
    // every returned character as untrusted text, never executable HTML.
    return String(item.body_text ?? item.body ?? '').trim();
  }

  function firstLine(issue) {
    const lines = bodyOf(issue).split(/\r?\n/).map(line => line.trim());
    const line = lines.find(value => value && !/^#{1,6}\s/.test(value) &&
      !['意见或改进建议', '涉及模板', '补充信息', '_No response_', 'No response'].includes(value) &&
      !/^<!--.*-->$/.test(value));
    return line || String(issue.title || '未填写意见正文');
  }

  function errorText(error) {
    return error.name === 'AbortError' ? '连接超时，请稍后重试。' :
      error.message || '暂时无法连接 GitHub，请检查网络后重试。';
  }

  async function getAll(path) {
    let url = `${api}${path}`;
    const collected = [];
    const seenPages = new Set();
    while (url) {
      // Only follow pagination within this repository's Issues API.
      if (!url.startsWith(`${api}/issues`) || seenPages.has(url)) throw new Error('留言分页异常，请在 GitHub 查看完整对话。');
      seenPages.add(url);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(url, {
          headers: { Accept: 'application/vnd.github.text+json' },
          credentials: 'omit', cache: 'no-store', signal: controller.signal
        });
        if (!response.ok) {
          if (response.status === 403 || response.status === 429) throw new Error('GitHub 暂时限制访问，请稍后重试，或在 GitHub 直接查看。');
          if (response.status === 404) throw new Error('暂时找不到留言，请在 GitHub 确认留言是否仍然可用。');
          throw new Error(`留言服务暂时不可用（${response.status}），请稍后重试。`);
        }
        const page = await response.json();
        if (!Array.isArray(page)) throw new Error('留言数据格式异常，请稍后重试。');
        collected.push(...page);
        const next = (response.headers.get('Link') || '').match(/<([^>]+)>;\s*rel="next"/);
        url = next ? next[1] : null;
      } catch (error) {
        if (error instanceof TypeError) throw new Error('暂时无法连接 GitHub，请检查网络后重试，或在 GitHub 直接查看。');
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
    return collected;
  }

  function message(item, original = false) {
    const login = item.user?.login || '已注销用户';
    const isAdmin = administrators.has(login.toLowerCase());
    const article = el('article', `feedback-message${isAdmin ? ' is-admin' : ''}`);
    const meta = el('div', 'feedback-message-meta');
    meta.append(el('span', 'feedback-author', login));
    meta.append(el('span', `feedback-badge${isAdmin ? ' admin' : ''}`, isAdmin ? '管理员' : '成员'));
    if (original) meta.append(el('span', 'feedback-badge', '发起留言'));
    meta.append(time(item.created_at));
    article.append(meta, el('p', 'feedback-body', bodyOf(item) || '（未填写正文，可在 GitHub 查看附件或原文。）'));
    return article;
  }

  function thread(issue, expanded) {
    const details = el('details', 'feedback-thread');
    details.id = `feedback-${issue.number}`;
    details.dataset.number = String(issue.number);
    const summary = el('summary');
    const preview = el('span', 'feedback-preview', firstLine(issue));
    preview.title = firstLine(issue);
    const chevron = el('span', 'feedback-chevron');
    chevron.setAttribute('aria-hidden', 'true');
    const meta = el('span', 'feedback-summary-meta');
    const replyCount = el('span', '', `${issue.comments || 0} 条回复`);
    meta.append(el('span', 'feedback-summary-author', issue.user?.login || '已注销用户'), replyCount,
      el('span', `feedback-state${issue.state === 'closed' ? ' closed' : ''}`, issue.state === 'closed' ? '已关闭' : '讨论中'));
    summary.append(preview, time(issue.created_at, true), chevron, meta);
    const conversation = el('div', 'feedback-conversation');
    const heading = el('h3', 'feedback-subject', issue.title || '意见详情');
    const repliesHeading = el('h4', 'feedback-reply-heading', '回复对话');
    const replies = el('ol', 'feedback-replies');
    const replyStatus = el('p', 'feedback-reply-status', '展开后加载全部回复…');
    replyStatus.setAttribute('role', 'status');
    const retry = el('button', 'feedback-button', '重试加载回复');
    retry.type = 'button';
    retry.hidden = true;
    const actions = el('div', 'feedback-thread-actions');
    const issueUrl = `${github}/issues/${issue.number}`;
    if (!issue.locked) {
      actions.append(externalLink('回复此留言 ↗', `${issueUrl}#new_comment_field`, 'feedback-button primary'));
      actions.append(el('small', '', '成员与管理员均在 GitHub 登录后回复，管理员回复自动标识。'));
    } else {
      actions.append(el('small', '', '此对话已被锁定；管理员可在 GitHub 管理。'));
    }
    actions.append(externalLink('查看原文 / 管理 ↗', issueUrl, 'feedback-button'));
    conversation.append(heading, message(issue, true), repliesHeading, replies, replyStatus, retry, actions);
    details.append(summary, conversation);

    let loaded = false;
    let loading = false;
    async function loadReplies() {
      if (loaded || loading) return;
      loading = true;
      retry.hidden = true;
      replyStatus.hidden = false;
      replyStatus.classList.remove('is-error');
      replyStatus.textContent = '正在加载全部回复…';
      try {
        const cacheKey = `${issue.number}:${issue.updated_at}:${issue.comments}`;
        let comments = commentCache.get(cacheKey);
        if (!comments) {
          comments = issue.comments === 0 ? [] : await getAll(`/issues/${issue.number}/comments?per_page=100`);
          comments = [...new Map(comments.map(comment => [comment.id, comment])).values()]
            .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id);
          commentCache.set(cacheKey, comments);
        }
        replies.replaceChildren(...comments.map(comment => {
          const li = el('li');
          li.append(message(comment));
          return li;
        }));
        replyCount.textContent = `${comments.length} 条回复`;
        repliesHeading.textContent = `回复对话 · ${comments.length}`;
        replyStatus.textContent = comments.length ? '' : '还没有回复，欢迎补充想法。';
        replyStatus.hidden = comments.length > 0;
        loaded = true;
      } catch (error) {
        replyStatus.textContent = `回复未能加载完整。${errorText(error)}`;
        replyStatus.classList.add('is-error');
        retry.hidden = false;
      } finally {
        loading = false;
      }
    }
    details.addEventListener('toggle', () => { if (details.open) loadReplies(); });
    retry.addEventListener('click', loadReplies);
    details.open = expanded;
    return details;
  }

  async function loadIssues(force = false) {
    if (busy) return;
    busy = true;
    lastAttempt = Date.now();
    refresh.disabled = true;
    status.classList.remove('is-error');
    status.textContent = hasLoaded ? '正在刷新留言…' : '正在加载留言…';
    list.setAttribute('aria-busy', 'true');
    try {
      const items = await getAll('/issues?state=all&sort=created&direction=desc&per_page=100');
      const issues = [...new Map(items.filter(item => !item.pull_request && Number.isInteger(item.number))
        .map(item => [item.number, item])).values()]
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.number - a.number);
      const expanded = new Set([...list.querySelectorAll('details[open]')].map(item => item.dataset.number));
      if (force) commentCache.clear();
      list.replaceChildren(...issues.map(issue => thread(issue, expanded.has(String(issue.number)))));
      if (!issues.length) list.append(el('div', 'feedback-empty', '还没有留言。点击「提出意见」，留下第一条需求或建议。'));
      count.textContent = `· ${issues.length} 条留言`;
      status.textContent = `已同步 · ${timeFormat.format(new Date())}`;
      hasLoaded = true;
    } catch (error) {
      status.textContent = `${hasLoaded ? '刷新失败，保留上次显示的内容。' : '留言暂时未能加载。'}${errorText(error)}`;
      status.classList.add('is-error');
    } finally {
      list.removeAttribute('aria-busy');
      refresh.disabled = false;
      busy = false;
    }
  }

  refresh.addEventListener('click', () => loadIssues(true));
  document.getElementById('feedback').addEventListener('click', event => {
    const link = event.target.closest('a');
    if (link?.href.startsWith(`${github}/issues`)) returnPending = true;
  });
  // Refresh on return from GitHub, without background polling or token storage.
  function onReturn() {
    if (returnPending && !document.hidden && !busy && Date.now() - lastAttempt > 5000) {
      returnPending = false;
      loadIssues(true);
    }
  }
  window.addEventListener('focus', onReturn);
  document.addEventListener('visibilitychange', onReturn);
  loadIssues();
})();
