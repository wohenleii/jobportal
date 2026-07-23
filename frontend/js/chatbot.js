/**
 * JobPortal Gemini chatbot — floating widget for students & employers.
 * Calls /api/chat only; the API key never reaches the browser.
 */
(function initJobPortalChatbot() {
  const user = typeof api !== 'undefined' ? api.getUser() : null;
  if (!api.isLoggedIn() || !user || (user.role !== 'student' && user.role !== 'employer')) {
    return;
  }

  const history = [];
  let busy = false;
  let remainingDaily = null;

  const root = document.createElement('div');
  root.id = 'jp-chatbot';
  root.innerHTML = `
    <button type="button" class="jp-chat-fab" id="jpChatToggle" aria-label="Open AI assistant" title="AI Assistant">
      <i class="bi bi-chat-dots-fill" aria-hidden="true"></i>
    </button>
    <div class="jp-chat-panel" id="jpChatPanel" hidden>
      <div class="jp-chat-header">
        <div>
          <div class="jp-chat-title">JobPortal Assistant</div>
          <div class="jp-chat-sub" id="jpChatSub">${user.role === 'student' ? 'Career help powered by Gemini' : 'Hiring help powered by Gemini'}</div>
        </div>
        <button type="button" class="jp-chat-close" id="jpChatClose" aria-label="Close chat">&times;</button>
      </div>
      <div class="jp-chat-messages" id="jpChatMessages" role="log" aria-live="polite"></div>
      <form class="jp-chat-form" id="jpChatForm">
        <textarea id="jpChatInput" rows="1" maxlength="2000" placeholder="Ask about jobs, resumes, hiring…" required></textarea>
        <button type="submit" class="jp-chat-send" id="jpChatSend" aria-label="Send">
          <i class="bi bi-send-fill" aria-hidden="true"></i>
        </button>
      </form>
      <div class="jp-chat-quota" id="jpChatQuota"></div>
    </div>
  `;
  document.body.appendChild(root);

  const panel = document.getElementById('jpChatPanel');
  const messagesEl = document.getElementById('jpChatMessages');
  const input = document.getElementById('jpChatInput');
  const form = document.getElementById('jpChatForm');
  const sendBtn = document.getElementById('jpChatSend');
  const quotaEl = document.getElementById('jpChatQuota');
  const subEl = document.getElementById('jpChatSub');

  const welcome =
    user.role === 'employer'
      ? 'Hi! I can help with job posts, job descriptions, applicant review tips, and company profile advice.'
      : 'Hi! Ask me career questions — resumes, interviews, job search tips, and how to use JobPortal.';

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatText(text) {
    return esc(text)
      .replace(/^###\s+(.+)$/gm, '<strong>$1</strong>')
      .replace(/^##\s+(.+)$/gm, '<strong>$1</strong>')
      .replace(/^#\s+(.+)$/gm, '<strong>$1</strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  function addBubble(role, text, isError) {
    const div = document.createElement('div');
    div.className = `jp-chat-bubble jp-chat-${role}${isError ? ' jp-chat-error' : ''}`;
    div.innerHTML = formatText(text);
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setQuota(remaining) {
    if (remaining && typeof remaining.userDaily === 'number') {
      remainingDaily = remaining.userDaily;
      quotaEl.textContent = `${remainingDaily} messages left today`;
    }
  }

  function setOpen(open) {
    panel.hidden = !open;
    document.getElementById('jpChatToggle').classList.toggle('is-open', open);
    if (open) {
      input.focus();
      if (!messagesEl.childElementCount) addBubble('assistant', welcome);
    }
  }

  document.getElementById('jpChatToggle').addEventListener('click', () => {
    setOpen(panel.hidden);
  });
  document.getElementById('jpChatClose').addEventListener('click', () => setOpen(false));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  async function refreshStatus() {
    try {
      const data = await api.getChatStatus();
      if (!data.configured) {
        subEl.textContent = 'AI is not configured on the server yet';
        quotaEl.textContent = '';
        return;
      }
      setQuota(data.remaining);
    } catch (_) {
      /* ignore until first message */
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const message = input.value.trim();
    if (!message) return;

    addBubble('user', message);
    input.value = '';
    busy = true;
    sendBtn.disabled = true;

    const typing = document.createElement('div');
    typing.className = 'jp-chat-bubble jp-chat-assistant jp-chat-typing';
    typing.textContent = 'Thinking…';
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
      const data = await api.chat(
        message,
        history.map((h) => ({ role: h.role, text: h.text }))
      );
      typing.remove();
      addBubble('assistant', data.reply);
      history.push({ role: 'user', text: message });
      history.push({ role: 'model', text: data.reply });
      if (history.length > 12) history.splice(0, history.length - 12);
      setQuota(data.remaining);
    } catch (err) {
      typing.remove();
      addBubble('assistant', err.message || 'Something went wrong. Please try again.', true);
    } finally {
      busy = false;
      sendBtn.disabled = false;
      input.focus();
    }
  });

  refreshStatus();
})();
