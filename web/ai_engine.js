(() => {
  const model = window.SJ_AI_MODEL;
  if (!model) {
    window.SJ_AI = { ready:false };
    return;
  }

  const featureIndex = new Map(model.features.map((f, i) => [f, i]));
  const transitionMaps = {};
  Object.entries(model.languageModel.transitions || {}).forEach(([prev, rows]) => {
    transitionMaps[prev] = new Map(rows);
  });
  const unigram = new Map(model.languageModel.unigram || []);

  const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();

  function makeTerms(text) {
    const tokens = clean(text).match(/[a-z0-9]+/g) || [];
    const terms = [...tokens];
    for (let i = 0; i < tokens.length - 1; i++) terms.push(tokens[i] + ' ' + tokens[i + 1]);
    return terms;
  }

  function vectorize(text) {
    const counts = new Map();
    for (const term of makeTerms(text)) {
      const idx = featureIndex.get(term);
      if (idx == null) continue;
      counts.set(idx, (counts.get(idx) || 0) + 1);
    }
    if (!counts.size) return [];
    const vec = [];
    let norm2 = 0;
    counts.forEach((count, idx) => {
      const tf = 1 + Math.log(count);
      const value = tf * model.idf[idx];
      norm2 += value * value;
      vec.push([idx, value]);
    });
    const norm = Math.sqrt(norm2) || 1;
    return vec.map(([idx, v]) => [idx, v / norm]);
  }

  function predictIntent(labels) {
    const text = Array.isArray(labels) ? labels.join(' ') : String(labels || '');
    const vec = vectorize(text);
    const scores = model.classes.map((_, c) => {
      let s = model.intercept[c];
      for (const [idx, value] of vec) s += model.coef[c][idx] * value;
      return s;
    });
    const max = Math.max(...scores);
    const exps = scores.map((s) => Math.exp(s - max));
    const total = exps.reduce((a,b) => a+b, 0) || 1;
    const probs = exps.map((x) => x / total);
    let best = 0;
    for (let i=1;i<probs.length;i++) if (probs[i] > probs[best]) best = i;
    return {
      intent: model.classes[best],
      label: model.languageModel.intentLabels[model.classes[best]] || model.classes[best],
      confidence: probs[best],
      probabilities: Object.fromEntries(model.classes.map((c,i) => [c, probs[i]])),
    };
  }

  function transitionProbability(prev, next) {
    const p = transitionMaps[prev]?.get(next);
    if (p != null) return p;
    const u = unigram.get(next) || 0.0002;
    return Math.max(0.00008, u * 0.16);
  }

  function rankedNext(labels, context = {}) {
    const seq = (labels || []).map((x) => String(x).toLowerCase());
    const pred = predictIntent(seq);
    const last = seq.length ? seq[seq.length - 1] : '<s>';
    const score = new Map();
    const add = (word, value) => {
      if (!word || word === '</s>') return;
      score.set(word, (score.get(word) || 0) + value);
    };

    const transitions = transitionMaps[last] || transitionMaps['<s>'];
    transitions?.forEach((p, word) => add(word, p * 4.4));

    const intentWords = model.languageModel.intentWords[pred.intent] || [];
    intentWords.forEach((word, i) => add(word, Math.max(0.12, 0.72 - i * 0.045) * (0.55 + pred.confidence)));

    if (context.personalize !== false) {
      (context.recent || []).slice(0,8).forEach((word, i) => add(String(word).toLowerCase(), 0.26 - i * 0.02));
      (context.favorites || []).forEach((word) => add(String(word).toLowerCase(), 0.32));
    }

    const lastWord = seq[seq.length - 1];
    if (lastWord) score.delete(lastWord);
    return [...score.entries()].sort((a,b) => b[1]-a[1]).slice(0,8).map(([word, value]) => ({word, score:value}));
  }

  function sequenceScore(seq) {
    if (!seq.length) return -999;
    let score = Math.log(transitionProbability('<s>', seq[0]));
    for (let i=1;i<seq.length;i++) score += Math.log(transitionProbability(seq[i-1], seq[i]));
    score += 0.45 * Math.log(transitionProbability(seq[seq.length-1], '</s>'));

    // Small child-language grammar priors. The n-gram model remains the main scorer.
    if (seq[0] === 'i' && ['want','need','feel','like','love','have','can'].includes(seq[1])) score += 1.15;
    if (['what','where','who','why','how'].includes(seq[0])) score += 0.85;
    if (seq[0] === 'please' && ['help','give','stop','wait','come'].includes(seq[1])) score += 0.55;
    if (seq[0] === 'mom' || seq[0] === 'dad' || seq[0] === 'teacher') score += 0.12;
    return score;
  }

  function fixOrder(labels) {
    const original = (labels || []).map((x) => String(x).toLowerCase());
    if (original.length < 2 || original.length > 7) return {changed:false, labels:original, score:sequenceScore(original)};

    let beams = original.map((word, idx) => ({seq:[word], used:1<<idx, score:Math.log(transitionProbability('<s>', word))}));
    const width = 80;
    for (let depth=1; depth<original.length; depth++) {
      const nextBeams = [];
      for (const b of beams) {
        for (let i=0;i<original.length;i++) {
          if (b.used & (1<<i)) continue;
          const word = original[i];
          const prev = b.seq[b.seq.length-1];
          nextBeams.push({seq:[...b.seq, word], used:b.used | (1<<i), score:b.score + Math.log(transitionProbability(prev, word))});
        }
      }
      nextBeams.sort((a,b) => b.score-a.score);
      beams = nextBeams.slice(0,width);
    }
    let best = beams[0]?.seq || original;
    let bestScore = -Infinity;
    for (const b of beams) {
      const s = sequenceScore(b.seq);
      if (s > bestScore) { bestScore=s; best=b.seq; }
    }
    const changed = best.some((x,i) => x !== original[i]);
    return {changed, labels:best, score:bestScore};
  }

  function agentDecision(labels, context = {}) {
    const pred = predictIntent(labels);
    const suggestions = rankedNext(labels, context);
    const tokens = (labels || []).map((x) => String(x).toLowerCase());
    const safetyWords = new Set(['help','hurt','sick','scared','stop']);
    const safety = pred.intent === 'help_safety' || tokens.some((t) => safetyWords.has(t));
    const fix = tokens.length >= 2 && tokens.length <= 7 ? fixOrder(tokens) : {changed:false, labels:tokens};
    return { prediction: pred, suggestions, safety, fix };
  }

  window.SJ_AI = {
    ready:true,
    modelInfo:{name:model.name, version:model.version, algorithm:model.algorithm, validation:model.validation},
    predictIntent,
    rankedNext,
    fixOrder,
    agentDecision,
  };
})();
