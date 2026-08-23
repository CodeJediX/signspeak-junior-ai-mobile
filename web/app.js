(() => {
  const { CATEGORIES, BUILT_IN_WORDS, QUICK_PHRASES, NEXT_WORDS } = window.SJ_DATA;
  const STORE_KEY = 'signspeak-junior-v1';
  const DEFAULT_SETTINGS = {
    rate: 0.9,
    pitch: 1,
    autoSpeakWord: true,
    focusMode: false,
    showSuggestions: true,
    visualMode: 'picture',
    voiceName: '',
    pin: '1234',
    aiHelper: true,
    aiPersonalize: true,
  };

  const $ = (id) => document.getElementById(id);
  const state = {
    settings: { ...DEFAULT_SETTINGS },
    customWords: [],
    favorites: new Set(),
    hidden: new Set(),
    sentence: [],
    history: [],
    category: 'Core',
    query: '',
    recent: [],
    voices: [],
    speakingIndex: -1,
    speechRun: 0,
    customImageData: '',
    setupCompleted: false,
  };

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
      state.customWords = Array.isArray(data.customWords) ? data.customWords : [];
      state.favorites = new Set(data.favorites || []);
      state.hidden = new Set(data.hidden || []);
      state.recent = Array.isArray(data.recent) ? data.recent : [];
      state.setupCompleted = Boolean(data.setupCompleted);
    } catch (_) {}
  }

  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        settings: state.settings,
        customWords: state.customWords,
        favorites: [...state.favorites],
        hidden: [...state.hidden],
        recent: state.recent.slice(0, 20),
        setupCompleted: state.setupCompleted,
      }));
    } catch (_) {
      toast('Storage is full. Try using smaller custom photos.');
    }
  }

  function allWords() {
    return [...BUILT_IN_WORDS, ...state.customWords];
  }

  function getWord(label) {
    return allWords().find((w) => w.label.toLowerCase() === label.toLowerCase());
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>'"]/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[c]));
  }

  function pictureMarkup(word, lazy = true) {
    const fallback = `<span class="picture-fallback" aria-hidden="true">${escapeHTML(word.emoji || '⭐')}</span>`;
    if (state.settings.visualMode === 'emoji' || !word.image) return fallback;
    const img = `<img src="${escapeHTML(word.image)}" alt="" ${lazy ? 'loading="lazy"' : ''} referrerpolicy="no-referrer" onerror="this.remove()" />`;
    return fallback + img;
  }

  let toastTimer;
  window.addEventListener('error', (event) => {
    console.error('SignSpeak Junior UI error:', event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('SignSpeak Junior promise error:', event.reason);
  });


  function dismissPreloader() {
    const preloader = $('preloader');
    if (!preloader || preloader.dataset.dismissed === 'true') return;
    preloader.dataset.dismissed = 'true';
    const finish = () => {
      preloader.classList.add('is-hiding');
      document.body.classList.remove('is-loading');
      setTimeout(() => { preloader.hidden = true; }, 600);
    };
    // Give the logo a brief splash moment, but never hold the child UI for long.
    const minSplash = 1350;
    if (document.readyState === 'complete') {
      setTimeout(finish, minSplash);
    } else {
      const started = performance.now();
      window.addEventListener('load', () => {
        const remaining = Math.max(150, minSplash - (performance.now() - started));
        setTimeout(finish, remaining);
      }, { once:true });
      setTimeout(finish, 3200);
    }
  }
  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
  }

  function selectedVoice() {
    return state.voices.find((v) => v.name === state.settings.voiceName)
      || state.voices.find((v) => /^en(-|_)/i.test(v.lang))
      || state.voices[0];
  }

  function speakText(text, onEnd) {
    const spokenText = String(text || '').trim();
    if (!spokenText) { onEnd?.(); return; }

    // Android APK: use native TextToSpeech. On some phones the TTS engine
    // becomes ready a moment after the Activity starts, so wait briefly
    // instead of silently dropping the child's first word.
    if (window.AndroidBridge?.isNativeApp?.()) {
      let attempts = 0;
      const tryNativeSpeech = () => {
        try {
          const ready = window.AndroidBridge?.isTtsReady?.();
          if (ready) {
            window.AndroidBridge.speak(
              spokenText,
              Number(state.settings.rate || 1),
              Number(state.settings.pitch || 1)
            );
            const delay = Math.max(480, spokenText.length * 70 / Math.max(0.6, Number(state.settings.rate || 1)));
            setTimeout(() => onEnd?.(), delay);
            return;
          }
        } catch (_) {}
        attempts += 1;
        if (attempts <= 10) {
          setTimeout(tryNativeSpeech, 220);
        } else {
          toast('Voice is not ready. Check Android Text-to-Speech settings.');
          onEnd?.();
        }
      };
      tryNativeSpeech();
      return;
    }

    if (!('speechSynthesis' in window)) {
      toast('Speech is not supported on this device.');
      onEnd?.();
      return;
    }
    const u = new SpeechSynthesisUtterance(spokenText);
    const voice = selectedVoice();
    if (voice) u.voice = voice;
    u.rate = state.settings.rate;
    u.pitch = state.settings.pitch;
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    window.speechSynthesis.speak(u);
  }

  function stopSpeech() {
    state.speechRun += 1;
    try { window.AndroidBridge?.stopSpeech?.(); } catch (_) {}
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    state.speakingIndex = -1;
    renderSentence();
  }

  function speakWord(word) {
    stopSpeech();
    setTimeout(() => speakText(word.spoken || word.label), 20);
  }

  function pushHistory() {
    state.history.push(state.sentence.map((w) => ({ ...w })));
    if (state.history.length > 50) state.history.shift();
  }

  function addWord(word, speak = state.settings.autoSpeakWord) {
    pushHistory();
    state.sentence.push({ ...word, instanceId: `${word.id}-${Date.now()}-${Math.random()}` });
    state.recent = [word.id, ...state.recent.filter((id) => id !== word.id)].slice(0, 20);
    saveStore();
    renderSentence();
    renderWords();
    if (speak) speakWord(word);
  }

  function removeAt(index) {
    pushHistory();
    state.sentence.splice(index, 1);
    renderSentence();
  }

  function moveWord(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= state.sentence.length) return;
    pushHistory();
    [state.sentence[index], state.sentence[target]] = [state.sentence[target], state.sentence[index]];
    renderSentence();
  }

  function undo() {
    if (!state.history.length) return;
    state.sentence = state.history.pop();
    stopSpeech();
    renderSentence();
  }

  function clearSentence() {
    if (!state.sentence.length) return;
    pushHistory();
    state.sentence = [];
    stopSpeech();
    renderSentence();
  }

  function speakSentence() {
    if (!state.sentence.length) {
      toast('Choose some words first.');
      return;
    }
    stopSpeech();
    const run = ++state.speechRun;
    const queue = [...state.sentence];
    const next = (i) => {
      if (run !== state.speechRun) return;
      if (i >= queue.length) {
        state.speakingIndex = -1;
        renderSentence();
        return;
      }
      state.speakingIndex = i;
      renderSentence();
      speakText(queue[i].spoken || queue[i].label, () => {
        if (run === state.speechRun) setTimeout(() => next(i + 1), 90);
      });
    };
    next(0);
  }

  function usePhrase(words) {
    const items = words.map(getWord).filter(Boolean);
    pushHistory();
    state.sentence = items.map((w) => ({ ...w, instanceId: `${w.id}-${Date.now()}-${Math.random()}` }));
    stopSpeech();
    renderSentence();
  }

  function renderSentence() {
    $('sentenceText').textContent = state.sentence.length
      ? state.sentence.map((w) => w.label).join(' ')
      : 'Tap a word below to build your sentence';

    const strip = $('sentenceStrip');
    if (!state.sentence.length) {
      strip.innerHTML = '<div class="sentence-placeholder">👆 Tap a word card below to start talking.</div>';
    } else {
      strip.innerHTML = state.sentence.map((word, index) => {
        const picture = pictureMarkup(word, false);
        return `<div class="sentence-chip ${state.speakingIndex === index ? 'is-speaking' : ''}" role="listitem" draggable="true" data-index="${index}">
          <div class="chip-picture">${picture}</div>
          <span>${escapeHTML(word.label)}</span>
          <div class="chip-controls">
            <button data-action="left" data-index="${index}" ${index === 0 ? 'disabled' : ''} aria-label="Move ${escapeHTML(word.label)} left">←</button>
            <button data-action="right" data-index="${index}" ${index === state.sentence.length - 1 ? 'disabled' : ''} aria-label="Move ${escapeHTML(word.label)} right">→</button>
            <button data-action="remove" data-index="${index}" aria-label="Remove ${escapeHTML(word.label)}">×</button>
          </div>
        </div>`;
      }).join('');
    }
    $('undoBtn').disabled = !state.history.length;
    $('clearBtn').disabled = !state.sentence.length;
    $('speakSentenceBtn').disabled = !state.sentence.length;
    renderSuggestions();
    renderAIHelper();
  }

  function renderSuggestions() {
    const el = $('suggestions');
    if (state.settings.aiHelper || !state.settings.showSuggestions || !state.sentence.length) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    const last = state.sentence[state.sentence.length - 1].label.toLowerCase();
    const words = (NEXT_WORDS[last] || []).map(getWord).filter(Boolean).slice(0, 6);
    if (!words.length) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.innerHTML = '<span>Try next:</span>' + words.map((w) => `<button data-word-id="${escapeHTML(w.id)}">${escapeHTML(w.emoji || '⭐')} ${escapeHTML(w.label)}</button>`).join('');
  }


  function aiContext() {
    const words = allWords();
    const recentLabels = state.recent.map((id) => words.find((w) => w.id === id)?.label).filter(Boolean);
    const favoriteLabels = [...state.favorites].map((id) => words.find((w) => w.id === id)?.label).filter(Boolean);
    return { recent: recentLabels, favorites: favoriteLabels, personalize: state.settings.aiPersonalize !== false };
  }

  function aiWordFromLabel(label) {
    return allWords().find((w) => w.label.toLowerCase() === String(label || '').toLowerCase());
  }

  function renderAIHelper() {
    const panel = $('aiPanel');
    if (!panel) return;
    const enabled = state.settings.aiHelper !== false && window.SJ_AI?.ready;
    const modelState = $('aiModelState');
    panel.classList.toggle('ai-off', !enabled);
    modelState.classList.toggle('is-off', !enabled);
    modelState.textContent = enabled ? 'AI ready' : 'AI off';
    if (!enabled) {
      $('aiStatusText').textContent = window.SJ_AI?.ready
        ? 'AI suggestions are turned off.'
        : 'AI model could not be loaded.';
      $('aiUnderstanding').hidden = true;
      $('aiSafetyNote').hidden = true;
      $('aiSuggestionChips').innerHTML = '<span class="ai-empty-hint">AI suggestions are off.</span>';
      $('aiAddBestBtn').disabled = true;
      $('aiFixOrderBtn').disabled = true;
      return;
    }

    const labels = state.sentence.map((w) => w.label);
    const decision = window.SJ_AI.agentDecision(labels, aiContext());
    const hasSentence = labels.length > 0;
    $('aiUnderstanding').hidden = !hasSentence;
    if (hasSentence) {
      $('aiIntentLabel').textContent = decision.prediction.label;
      $('aiConfidence').textContent = `${Math.round(decision.prediction.confidence * 100)}% match`;
      $('aiStatusText').textContent = decision.safety
        ? 'I noticed an important message, so help and safety words are given priority.'
        : 'I am understanding the sentence and choosing useful next words.';
    } else {
      $('aiStatusText').textContent = 'Choose a word and I will understand the message and suggest what may come next.';
    }

    const suggestions = decision.suggestions.map((x) => aiWordFromLabel(x.word)).filter(Boolean).slice(0,6);
    $('aiSuggestionChips').innerHTML = suggestions.length
      ? suggestions.map((w) => `<button type="button" data-ai-word-id="${escapeHTML(w.id)}">${escapeHTML(w.emoji || '⭐')} ${escapeHTML(w.label)}</button>`).join('')
      : '<span class="ai-empty-hint">Your message already looks complete. You can press <b>Speak</b>.</span>';

    const best = suggestions[0];
    $('aiAddBestBtn').disabled = !best;
    $('aiAddBestBtn').dataset.wordId = best?.id || '';
    $('aiFixOrderBtn').disabled = !decision.fix?.changed;
    $('aiSafetyNote').hidden = !decision.safety;
  }

  function applyAIFixOrder() {
    if (!window.SJ_AI?.ready || state.sentence.length < 2 || state.sentence.length > 7) return;
    const result = window.SJ_AI.fixOrder(state.sentence.map((w) => w.label));
    if (!result.changed) {
      toast('The AI thinks the word order is already good.');
      return;
    }
    const pool = state.sentence.map((w, i) => ({ word:w, used:false, i }));
    const reordered = [];
    for (const label of result.labels) {
      const found = pool.find((x) => !x.used && x.word.label.toLowerCase() === label.toLowerCase());
      if (found) { found.used = true; reordered.push(found.word); }
    }
    if (reordered.length !== state.sentence.length) return;
    pushHistory();
    state.sentence = reordered;
    stopSpeech();
    renderSentence();
    toast('AI improved the word order ✨');
  }

  function addBestAISuggestion() {
    const id = $('aiAddBestBtn')?.dataset.wordId;
    if (!id) return;
    const word = allWords().find((w) => w.id === id);
    if (word) addWord(word);
  }

  function visibleWords() {
    const q = state.query.trim().toLowerCase();
    let words = allWords().filter((w) => !state.hidden.has(w.id));
    if (state.settings.focusMode) words = words.filter((w) => state.favorites.has(w.id) || w.coreFocus);
    if (q) return words.filter((w) => w.label.toLowerCase().includes(q));
    if (state.category === 'Favorites') return words.filter((w) => state.favorites.has(w.id));
    if (state.category === 'Recent') return state.recent.map((id) => words.find((w) => w.id === id)).filter(Boolean);
    return words.filter((w) => w.category === state.category);
  }

  const CATEGORY_ICONS = {
    Favorites: '⭐', Recent: '🕘', Core: '💬', People: '👥', Actions: '🏃',
    Social: '👋', Feelings: '😊', Questions: '❓', Describing: '🌈', Things: '🎒'
  };

  function syncVisualModeUI() {
    const mode = state.settings.visualMode === 'emoji' ? 'emoji' : 'picture';
    const switcher = $('visualModeSwitch');
    if (!switcher) return;
    switcher.classList.toggle('is-emoji', mode === 'emoji');
    switcher.classList.toggle('is-picture', mode === 'picture');
    $('emojiViewBtn').setAttribute('aria-pressed', String(mode === 'emoji'));
    $('pictureViewBtn').setAttribute('aria-pressed', String(mode === 'picture'));
    const label = $('visualSectionLabel');
    if (label) label.textContent = mode === 'emoji' ? 'EMOJI WORDS' : 'PICTURE WORDS';
  }

  function setVisualMode(mode) {
    state.settings.visualMode = mode === 'emoji' ? 'emoji' : 'picture';
    saveStore();
    syncVisualModeUI();
    renderWords();
    renderSentence();
    toast(state.settings.visualMode === 'emoji' ? 'Emoji view on 😊' : 'Picture view on 🖼️');
  }

  function renderCategories() {
    const tabs = ['Favorites', 'Recent', ...CATEGORIES];
    $('categoryTabs').innerHTML = tabs.map((c) => `<button class="${state.category === c && !state.query ? 'active' : ''}" data-category="${escapeHTML(c)}" role="tab" aria-selected="${state.category === c && !state.query}"><span aria-hidden="true">${CATEGORY_ICONS[c] || '•'}</span> ${escapeHTML(c)}</button>`).join('');
  }

  function renderWords() {
    renderCategories();
    const words = visibleWords();
    const grid = $('wordGrid');
    if (!words.length) {
      grid.innerHTML = '<div class="empty-state">No words here yet. Try another category or add a custom word in Parent Settings.</div>';
      return;
    }
    grid.innerHTML = words.map((word) => {
      const picture = pictureMarkup(word, true);
      const fav = state.favorites.has(word.id);
      return `<article class="word-card" data-category="${escapeHTML(word.category || 'Things')}">
        <button class="favorite" data-action="favorite" data-word-id="${escapeHTML(word.id)}" aria-label="${fav ? 'Remove' : 'Add'} ${escapeHTML(word.label)} ${fav ? 'from' : 'to'} favorites">${fav ? '★' : '☆'}</button>
        <button class="word-main" data-action="add" data-word-id="${escapeHTML(word.id)}" aria-label="Add ${escapeHTML(word.label)} to sentence">
          <div class="word-picture">${picture}</div><strong>${escapeHTML(word.label)}</strong>
        </button>
        <button class="listen-word" data-action="listen" data-word-id="${escapeHTML(word.id)}" aria-label="Listen to ${escapeHTML(word.label)}">🔊 Listen</button>
      </article>`;
    }).join('');
  }

  function renderQuickPhrases() {
    $('quickPhrases').innerHTML = QUICK_PHRASES.map((p, i) => `<button data-phrase-index="${i}"><span>${escapeHTML(p.icon)}</span>${escapeHTML(p.name)}</button>`).join('');
  }

  function loadVoices() {
    state.voices = window.speechSynthesis?.getVoices?.() || [];
    const select = $('voiceSelect');
    const current = state.settings.voiceName;
    select.innerHTML = '<option value="">Automatic English voice</option>' + state.voices.map((v) => `<option value="${escapeHTML(v.name)}">${escapeHTML(v.name)} (${escapeHTML(v.lang)})</option>`).join('');
    select.value = current;
  }

  function syncSettingsUI() {
    $('rateRange').value = state.settings.rate;
    $('rateValue').textContent = `${Number(state.settings.rate).toFixed(1)}×`;
    $('autoSpeakToggle').checked = !!state.settings.autoSpeakWord;
    $('suggestionsToggle').checked = !!state.settings.showSuggestions;
    $('focusToggle').checked = !!state.settings.focusMode;
    $('aiHelperToggle').checked = state.settings.aiHelper !== false;
    $('aiPersonalizeToggle').checked = state.settings.aiPersonalize !== false;
    const aiInfo = window.SJ_AI?.modelInfo?.validation;
    $('aiValidationText').textContent = aiInfo ? `${Math.round(aiInfo.accuracy * 1000) / 10}% held-out synthetic validation (${aiInfo.heldOutSamples} test examples)` : 'AI model unavailable';
    $('newPinInput').value = state.settings.pin;
    $('voiceSelect').value = state.settings.voiceName || '';
    syncVisualModeUI();
    $('customCategory').innerHTML = CATEGORIES.filter((x) => x !== 'Core').map((x) => `<option>${escapeHTML(x)}</option>`).join('');
    renderCustomList();
  }

  function renderCustomList() {
    const list = $('customList');
    if (!state.customWords.length) {
      list.innerHTML = '<p class="muted">No custom words yet.</p>';
      return;
    }
    list.innerHTML = state.customWords.map((w) => `<div><span>${w.image ? '🖼️' : escapeHTML(w.emoji || '⭐')} ${escapeHTML(w.label)}</span><button data-delete-custom="${escapeHTML(w.id)}">Delete</button></div>`).join('');
  }

  function showModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.style.removeProperty('display');
    modal.hidden = false;
    modal.removeAttribute('hidden');
  }

  function hideModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('hidden', '');
    // Inline fallback protects against any stylesheet/browser that overrides [hidden].
    modal.style.display = 'none';
  }

  function readParentSettingsFromUI() {
    state.settings.voiceName = $('voiceSelect').value || '';
    state.settings.rate = Number($('rateRange').value) || DEFAULT_SETTINGS.rate;
    state.settings.autoSpeakWord = $('autoSpeakToggle').checked;
    state.settings.showSuggestions = $('suggestionsToggle').checked;
    state.settings.focusMode = $('focusToggle').checked;
    state.settings.aiHelper = $('aiHelperToggle').checked;
    state.settings.aiPersonalize = $('aiPersonalizeToggle').checked;
    const pin = $('newPinInput').value.replace(/\D/g, '').slice(0, 8);
    state.settings.pin = pin || '1234';
  }

  function openParentGate() {
    $('pinInput').value = '';
    showModal('pinModal');
    setTimeout(() => $('pinInput').focus(), 0);
  }

  function openParentSettings() {
    syncSettingsUI();
    $('setupBanner').hidden = state.setupCompleted;
    $('parentCloseBtn').hidden = !state.setupCompleted;
    $('saveSettingsBtn').textContent = state.setupCompleted ? '✓ Save & Close' : '✓ Save & Continue';
    showModal('parentModal');
  }

  function completeParentSetup() {
    const wasComplete = state.setupCompleted;
    readParentSettingsFromUI();
    state.setupCompleted = true;
    saveStore();

    // First-run requirement: Save & Continue must always leave Parent Settings.
    hideModal('parentModal');
    $('setupBanner').hidden = true;
    $('parentCloseBtn').hidden = false;
    $('saveSettingsBtn').textContent = '✓ Save & Close';

    // Return focus to the child's communication workspace.
    setTimeout(() => {
      document.querySelector('.sentence-panel')?.scrollIntoView({ block: 'start' });
      $('searchInput')?.focus({ preventScroll: true });
    }, 0);

    toast(wasComplete ? 'Parent settings saved.' : 'Setup complete. Child workspace opened.');
  }

  function closeModal(id) {
    if (id === 'parentModal' && !state.setupCompleted) {
      toast('Press Save & Continue to finish the first-time setup.');
      return;
    }
    hideModal(id);
  }

  function addCustomWord(event) {
    event.preventDefault();
    const label = $('customWord').value.trim();
    if (!label) {
      toast('Enter a word first.');
      return;
    }
    const spoken = $('customSpoken').value.trim() || label;
    const emoji = $('customEmoji').value.trim() || '⭐';
    const category = $('customCategory').value || 'Things';
    const id = `custom-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
    state.customWords.push({ id, label, spoken, emoji, category, image: state.customImageData, custom: true });
    state.customImageData = '';
    $('customWord').value = '';
    $('customSpoken').value = '';
    $('customEmoji').value = '⭐';
    $('customImage').value = '';
    $('imagePreview').hidden = true;
    saveStore();
    renderWords();
    renderCustomList();
    toast('Custom word added.');
  }

  function deleteCustom(id) {
    state.customWords = state.customWords.filter((w) => w.id !== id);
    state.favorites.delete(id);
    state.recent = state.recent.filter((x) => x !== id);
    state.sentence = state.sentence.filter((x) => x.id !== id);
    saveStore();
    renderWords();
    renderSentence();
    renderCustomList();
  }

  function onCustomImage(file) {
    if (!file) return;
    if (file.size > 600000) {
      toast('Please choose an image under 600 KB.');
      $('customImage').value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.customImageData = String(reader.result || '');
      $('imagePreview').src = state.customImageData;
      $('imagePreview').hidden = !state.customImageData;
    };
    reader.readAsDataURL(file);
  }

  function attachEvents() {
    $('fullscreenBtn').addEventListener('click', () => document.documentElement.requestFullscreen?.());
    $('parentBtn').addEventListener('click', openParentGate);
    $('saveSettingsBtn').addEventListener('click', completeParentSetup);
    $('setupContinueBtn').addEventListener('click', completeParentSetup);
    $('speakSentenceBtn').addEventListener('click', speakSentence);
    $('stopBtn').addEventListener('click', stopSpeech);
    $('undoBtn').addEventListener('click', undo);
    $('clearBtn').addEventListener('click', clearSentence);
    $('emojiViewBtn').addEventListener('click', () => setVisualMode('emoji'));
    $('pictureViewBtn').addEventListener('click', () => setVisualMode('picture'));
    $('aiAddBestBtn').addEventListener('click', addBestAISuggestion);
    $('aiFixOrderBtn').addEventListener('click', applyAIFixOrder);
    $('aiSuggestionChips').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ai-word-id]');
      if (!btn) return;
      const word = allWords().find((w) => w.id === btn.dataset.aiWordId);
      if (word) addWord(word);
    });

    $('searchInput').addEventListener('input', (e) => {
      state.query = e.target.value;
      $('clearSearchBtn').hidden = !state.query;
      renderWords();
    });
    $('clearSearchBtn').addEventListener('click', (e) => {
      e.preventDefault();
      state.query = '';
      $('searchInput').value = '';
      $('clearSearchBtn').hidden = true;
      renderWords();
    });

    $('categoryTabs').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-category]');
      if (!btn) return;
      state.category = btn.dataset.category;
      state.query = '';
      $('searchInput').value = '';
      $('clearSearchBtn').hidden = true;
      renderWords();
    });

    $('wordGrid').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-word-id]');
      if (!btn) return;
      const word = allWords().find((w) => w.id === btn.dataset.wordId);
      if (!word) return;
      const action = btn.dataset.action;
      if (action === 'add') addWord(word);
      if (action === 'listen') speakWord(word);
      if (action === 'favorite') {
        state.favorites.has(word.id) ? state.favorites.delete(word.id) : state.favorites.add(word.id);
        saveStore();
        renderWords();
      }
    });

    $('suggestions').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-word-id]');
      if (!btn) return;
      const word = allWords().find((w) => w.id === btn.dataset.wordId);
      if (word) addWord(word);
    });

    $('quickPhrases').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-phrase-index]');
      if (!btn) return;
      usePhrase(QUICK_PHRASES[Number(btn.dataset.phraseIndex)].words);
    });

    $('sentenceStrip').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const index = Number(btn.dataset.index);
      if (btn.dataset.action === 'left') moveWord(index, -1);
      if (btn.dataset.action === 'right') moveWord(index, 1);
      if (btn.dataset.action === 'remove') removeAt(index);
    });

    let draggedIndex = null;
    $('sentenceStrip').addEventListener('dragstart', (e) => {
      const chip = e.target.closest('.sentence-chip');
      if (!chip) return;
      draggedIndex = Number(chip.dataset.index);
      e.dataTransfer.effectAllowed = 'move';
    });
    $('sentenceStrip').addEventListener('dragover', (e) => e.preventDefault());
    $('sentenceStrip').addEventListener('drop', (e) => {
      e.preventDefault();
      const chip = e.target.closest('.sentence-chip');
      if (chip == null || draggedIndex == null) return;
      const target = Number(chip.dataset.index);
      if (target === draggedIndex) return;
      pushHistory();
      const [item] = state.sentence.splice(draggedIndex, 1);
      state.sentence.splice(target, 0, item);
      draggedIndex = null;
      renderSentence();
    });

    document.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.addEventListener('mousedown', (e) => {
      if (e.target !== backdrop) return;
      if (backdrop.id === 'parentModal' && !state.setupCompleted) {
        toast('Press Save & Continue to finish the first-time setup.');
        return;
      }
      hideModal(backdrop.id);
    }));

    $('pinForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if ($('pinInput').value === state.settings.pin) {
        closeModal('pinModal');
        openParentSettings();
      } else {
        $('pinInput').value = '';
        toast('Incorrect parent PIN.');
      }
    });

    $('voiceSelect').addEventListener('change', (e) => {
      state.settings.voiceName = e.target.value;
      saveStore();
    });
    $('rateRange').addEventListener('input', (e) => {
      state.settings.rate = Number(e.target.value);
      $('rateValue').textContent = `${state.settings.rate.toFixed(1)}×`;
      saveStore();
    });
    $('autoSpeakToggle').addEventListener('change', (e) => {
      state.settings.autoSpeakWord = e.target.checked;
      saveStore();
    });
    $('suggestionsToggle').addEventListener('change', (e) => {
      state.settings.showSuggestions = e.target.checked;
      saveStore();
      renderSuggestions();
    });
    $('focusToggle').addEventListener('change', (e) => {
      state.settings.focusMode = e.target.checked;
      saveStore();
      renderWords();
    });
    $('aiHelperToggle').addEventListener('change', (e) => {
      state.settings.aiHelper = e.target.checked;
      saveStore();
      renderSuggestions();
      renderAIHelper();
    });
    $('aiPersonalizeToggle').addEventListener('change', (e) => {
      state.settings.aiPersonalize = e.target.checked;
      saveStore();
      renderAIHelper();
    });
    $('newPinInput').addEventListener('change', (e) => {
      const value = e.target.value.replace(/\D/g, '').slice(0, 8);
      state.settings.pin = value || '1234';
      e.target.value = state.settings.pin;
      saveStore();
    });
    $('customWordForm').addEventListener('submit', addCustomWord);
    $('customImage').addEventListener('change', (e) => onCustomImage(e.target.files?.[0]));
    $('customList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-delete-custom]');
      if (btn) deleteCustom(btn.dataset.deleteCustom);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal('pinModal');
        closeModal('parentModal');
        stopSpeech();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    });
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  function init() {
    dismissPreloader();
    loadStore();
    syncVisualModeUI();
    renderQuickPhrases();
    renderWords();
    renderSentence();
    attachEvents();
    loadVoices();
    syncSettingsUI();
    renderAIHelper();
    registerServiceWorker();
    if (!state.setupCompleted) openParentSettings();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  init();
})();
