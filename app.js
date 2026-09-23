(() => {
  'use strict';
  const lessons = window.TEXTBOOK_DATA || [];
  // Edit lesson content, choices and correct answers in data/lessons/lesson-XX.js.
  const PART_RANGES = {1:[1,10], 2:[11,25], 3:[26,45]};
  // DOM references and current view state
  const $ = selector => document.querySelector(selector);
  const content = $('#content');
  const player = $('#player');
  const audio = $('#audio-player');
  let lessonId = 0;
  let tab = 'words';
  let segment = 1;
  const vocabVisible = {zh:true, py:false, ja:true};
  let activeWord = null;
  let activeTrack = null;
  let playbackState = 'stopped';
  let lastPraise = -1;
  const praises = ['正解です！', 'すばらしい！', 'よく聞き取れました！', 'その調子です！', '見事です！', 'ばっちりです！'];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  // Saved answers and HSK question helpers
  const answerKey = (id, number) => `donghua2-v2-${id}-${number}`;
  const getAnswer = (id, number) => { try { return localStorage.getItem(answerKey(id,number)) || ''; } catch { return ''; } };
  const setAnswer = (id, number, value) => { try { localStorage.setItem(answerKey(id,number), value); } catch {} };
  const clearAnswer = (id, number) => { try { localStorage.removeItem(answerKey(id,number)); } catch {} };
  const correctAnswers = (id, number) => lessons[id-1]?.questions[number-1]?.correct || [];
  const isCorrect = (id, number, value) => correctAnswers(id, number).includes(value);
  const countCorrect = id => lessons[id-1].questions.filter(q => isCorrect(id,q.number,getAnswer(id,q.number))).length;
  const shuffle = values => { const out=[...values]; for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];} return out; };
  const praise = () => { let index=Math.floor(Math.random()*praises.length); if (index===lastPraise) index=(index+1)%praises.length; lastPraise=index; return praises[index]; };
  const answerLabel = (q, key) => q.type==='trueFalse' ? (key==='true'?'○ 正しい':'× 誤り') : key+' '+q.choices[key];
  const trackUrl = (id, group, name) => `assets/audio/dg2/${id}k/${group}/dg2-${id}k-${group}-${name}.mp3`;
  const trackName = number => number <= 35 ? String(number) : number <= 37 ? '36.37' : number <= 39 ? '38.39' : number <= 41 ? '40.41' : number <= 43 ? '42.43' : '44.45';
  const lesson = () => lessons[lessonId - 1];
  const countAnswered = id => lessons[id-1].questions.filter(q => getAnswer(id,q.number)).length;
  // Navigation and page rendering
  function parseHash() {
    if (location.hash === '#intro') { lessonId = 0; tab = 'words'; return; }
    const match = location.hash.match(/^#lesson-(\d+)(?:\/(words|practice))?$/);
    if (match && lessons.some(item => item.id===Number(match[1]))) { lessonId = Number(match[1]); tab = match[2] || 'words'; }
  }
  function updateHash() {
    const hash = lessonId === 0 ? '#intro' : `#lesson-${lessonId}/${tab}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }
  function renderNav() {
    const introLink = `<button type="button" class="lesson-link ${lessonId===0?'active':''}" data-intro ${lessonId===0?'aria-current="page"':''}><span class="num">00</span><span>HSK聴解の説明</span></button>`;
    $('#lesson-nav').innerHTML = introLink + lessons.map(item => `<button type="button" class="lesson-link ${item.id===lessonId?'active':''}" data-lesson="${item.id}" ${item.id===lessonId?'aria-current="page"':''}><span class="num">0${item.id}</span><span>${escape(item.title)}</span></button>`).join('');
    $('#lesson-select').innerHTML = `<option value="intro" ${lessonId===0?'selected':''}>HSK聴解の説明</option>` + lessons.map(item => `<option value="${item.id}" ${item.id===lessonId?'selected':''}>${escape(item.title)}</option>`).join('');
  }
  function renderHeader() {
    if (lessonId === 0) {
      $('#lesson-index').textContent = 'BEFORE LESSON 01';
      $('#lesson-title').textContent = 'HSK（四級）聴解';
      $('#lesson-intro').textContent = '第一課の前に、問題の構成と聴き方を確認しましょう。';
      $('.tabs').hidden = true;
      document.title = 'HSK聴解の説明 | 動画中国語②';
      return;
    }
    $('.tabs').hidden = false;
    const item = lesson();
    $('#lesson-index').textContent = `LESSON 0${item.id}`;
    $('#lesson-title').textContent = item.title;
    $('#lesson-intro').textContent = `表現 ${item.points.length}語 · 単語 ${item.vocabulary.length}語 · 聴解 ${item.questions.length}問`;
    $('#progress-pill').textContent = `${countAnswered(item.id)}/${item.questions.length}`;
    document.title = `${item.title} | 動画中国語②`;
    document.querySelectorAll('.tab').forEach(button => {
      const current = button.dataset.tab === tab;
      button.setAttribute('aria-selected', String(current));
      button.tabIndex = current ? 0 : -1;
    });
  }
  function renderIntro() {
    return $('#intro-template').innerHTML;
  }
  // Expressions and vocabulary
  function wordDisplayTitle(word) {
    return (vocabVisible.zh && word.zh) || (vocabVisible.py && word.py) || (vocabVisible.ja && word.ja) || '単語の音声';
  }
  function wordAudioAttributes(word) {
    const supplement = Boolean(word.audioUrl);
    const source = supplement ? `data-name="supplement" data-url="${escape(word.audioUrl)}"` : `data-name="${escape(word.audioTrack)}"`;
    const visible = [vocabVisible.zh && word.zh, vocabVisible.py && word.py, vocabVisible.ja && word.ja].filter(Boolean);
    const label = visible.length ? `${visible.join('、')}。発音を再生` : '単語の音声を再生';
    return `data-play="t" ${source} data-title="${escape(wordDisplayTitle(word))}" aria-label="${escape(label)}" title="カードを押して発音を再生"`;
  }
  function renderVocabularyControls() {
    const items = [['zh','中国語'],['py','ピンイン'],['ja','日本語']];
    return `<div class="vocab-controls" role="group" aria-label="単語カードに表示する項目"><span class="vocab-controls-label">カードに表示</span>${items.map(([key,label]) => `<button type="button" class="vocab-toggle" data-vocab-toggle="${key}" aria-pressed="${vocabVisible[key]}" title="${label}の表示を切り替え">${label}</button>`).join('')}</div>`;
  }
  function renderVocabularyCard(word) {
    const visibleWord = [
      vocabVisible.zh ? `<span class="chinese" lang="zh-CN">${escape(word.zh)}</span>` : '',
      vocabVisible.py ? `<span class="pinyin" lang="zh-Latn-pinyin">${escape(word.py)}</span>` : ''
    ].join('');
    const translation = vocabVisible.ja
      ? `<span class="translation">${escape(word.ja)}</span>`
      : '';
    const placeholder = !visibleWord && !translation
      ? '<span class="vocab-hidden-label">音声を聴く</span>'
      : '';

    return `<button type="button" class="vocab-card" ${wordAudioAttributes(word)}>
      ${visibleWord ? `<span class="vocab-word">${visibleWord}</span>` : ''}
      ${translation}${placeholder}
      <span class="mini-play vocab-play" aria-hidden="true">▶</span>
    </button>`;
  }

  function renderExpressionCard(point, index) {
    return `<button type="button" class="point-card"
        data-play="p" data-name="${index+1}" data-title="${escape(point.zh)}"
        aria-label="${escape(point.zh)}、${escape(point.ja)}。発音を再生"
        title="カードを押して発音を再生">
      <span class="point-copy">
        <span class="chinese" lang="zh-CN">${escape(point.zh)}</span>
        <span class="translation">${escape(point.ja)}</span>
      </span>
      <span class="mini-play" aria-hidden="true">▶</span>
    </button>`;
  }

  function renderWords() {
    const item = lesson();
    const columns = Number(vocabVisible.zh || vocabVisible.py) + Number(vocabVisible.ja);
    const layout = columns===2 ? '' : columns===1 ? 'single-field' : 'audio-only';

    return `
      <div class="section-head"><h2>練習で使う表現</h2><small>タップして発音を確認</small></div>
      <p class="section-intro">まず意味を確認し、カードを押して音声を聴いてから声に出してみましょう。</p>
      <div class="card-grid">${item.points.map(renderExpressionCard).join('')}</div>
      <div class="section-head"><h2>単語</h2><small>${item.vocabulary.length}語</small></div>
      <p class="section-intro">単語カードのどこを押しても発音を再生できます。表示する言語を切り替えて練習しましょう。</p>
      ${renderVocabularyControls()}
      <div class="vocab-list ${layout}">${item.vocabulary.map(renderVocabularyCard).join('')}</div>`;
  }

  // Listening questions and feedback
  function scriptDisclosure(q, open=false) {
    return `<details class="transcript-detail" ${open?'open':''}><summary>聴解原文を見る</summary><div class="answer-script" lang="zh-CN">${escape(q.script)}</div></details>`;
  }
  function feedbackMarkup(q, saved) {
    if (!saved) return '';
    if (isCorrect(lessonId,q.number,saved)) return `<div class="answer-feedback correct" role="status"><strong>${praise()}</strong><span>聴解原文を開いて確認できます。</span></div>`;
    const labels=correctAnswers(lessonId,q.number).map(key=>answerLabel(q,key)).join(' ／ ');
    return `<div class="answer-feedback incorrect" role="status"><strong>もう一度確認しましょう。</strong><span>正解：${escape(labels)}</span></div>`;
  }
  function retryQuestionMarkup(q, saved) {
    if (!saved || isCorrect(lessonId,q.number,saved)) return '';
    return `<div class="question-retry"><p>正解と原文を確認したら、もう一度聴いて答えてみましょう。</p><button type="button" class="retry-question-button" data-retry-question="${q.number}">この問題にもう一度挑戦 <span aria-hidden="true">→</span></button></div>`;
  }
  function renderChoice(q, key, value, saved) {
    const selected = saved===key;
    const correct = saved && isCorrect(lessonId, q.number, key);
    const incorrect = selected && !correct;
    const label = q.type==='trueFalse' ? (key==='true' ? '○' : '×') : key;
    const language = q.type==='trueFalse' ? 'ja' : 'zh-CN';

    return `<button type="button" class="choice ${selected?'selected':''} ${correct?'correct':''} ${incorrect?'incorrect':''}"
        data-answer="${escape(key)}" data-question="${q.number}" aria-pressed="${selected}" ${saved?'disabled':''}>
      <span class="choice-key">${label}</span><span lang="${language}">${escape(value)}</span>
    </button>`;
  }

  function renderQuestion(q, grouped=false) {
    const saved = getAnswer(lessonId, q.number);
    const choices = q.type==='trueFalse'
      ? [['true','正しい'],['false','誤り']]
      : Object.entries(q.choices || {});
    const audioName = trackName(q.number);
    const typeLabel = q.type==='trueFalse' ? '正誤判断' : '選択問題';
    const playButton = grouped ? '' : `<button type="button" class="mini-play"
      data-play="l" data-name="${audioName}" data-title="第${q.number}問"
      aria-label="第${q.number}問の音声を再生">▶</button>`;

    return `<article class="question-card">
      <div class="question-top">
        <span class="question-number">${String(q.number).padStart(2,'0')}</span>
        <span class="question-type">${typeLabel}</span>${playButton}
      </div>
      ${q.statement ? `<p class="statement" lang="zh-CN">${escape(q.statement)}</p>` : ''}
      <div class="choices" role="group" aria-label="第${q.number}問の解答">
        ${choices.map(([key,value]) => renderChoice(q,key,value,saved)).join('')}
      </div>
      ${feedbackMarkup(q,saved)}
      ${saved ? scriptDisclosure(q,!isCorrect(lessonId,q.number,saved)) : ''}
      ${retryQuestionMarkup(q,saved)}
    </article>`;
  }

  function renderQuestionGroup(name, questions) {
    if (questions.length===1) return renderQuestion(questions[0]);
    const numbers = questions.map(q=>q.number).join('・');

    return `<section class="question-group" aria-label="第${numbers}問の共通音声">
      <div class="question-group-head">
        <div><strong>共通音声 · 第${numbers}問</strong>
          <small>この音声に小問が${questions.length}問あります</small></div>
        <button type="button" class="mini-play" data-play="l" data-name="${name}"
          data-title="第${numbers}問" aria-label="第${numbers}問の共通音声を再生">▶</button>
      </div>
      <div class="question-group-items">${shuffle(questions).map(q=>renderQuestion(q,true)).join('')}</div>
    </section>`;
  }

  function renderPractice() {
    const [first,last] = PART_RANGES[segment];
    const grouped = new Map();
    for (const q of lesson().questions.filter(q=>q.number>=first && q.number<=last)) {
      const name = trackName(q.number);
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name).push(q);
    }
    const cards = shuffle([...grouped.entries()])
      .map(([name,questions])=>renderQuestionGroup(name,questions)).join('');
    const partLabel = segment===1 ? '第一部分 · 正誤判断'
      : segment===2 ? '第二部分 · 短い会話' : '第三部分 · 会話・説明文';
    const partButtons = [1,2,3].map(n => `<button type="button" data-segment="${n}"
      class="${segment===n?'active':''}" aria-pressed="${segment===n}">第${n}部分</button>`).join('');

    return `<div class="notice"><strong>学習の進め方：</strong>この部分の小問は毎回ランダムな順番で出ます。共通音声の２問は一緒に表示します。答えを選ぶと提供された解答資料に基づく判定を表示し、間違えた場合は正解と原文が開き、この問題だけに再挑戦できます。</div>
      <div class="section-head"><h2>聴解練習</h2>
        <small>解答済み ${countAnswered(lessonId)} / ${lesson().questions.length} · 正解 ${countCorrect(lessonId)}</small></div>
      <div class="practice-tools">
        <p>${partLabel}</p>
        <div class="practice-controls">
          <div class="segment-control" aria-label="問題の部分">${partButtons}</div>
          <button type="button" class="retry-button" data-retry>この部分をもう一度</button>
        </div>
      </div>
      <div class="question-list">${cards}</div>`;
  }
  function updateProgress() {
    $('#progress-pill').textContent=`${countAnswered(lessonId)}/${lesson().questions.length}`;
    const stat=document.querySelector('.section-head small');
    if (stat && stat.textContent.includes('解答済み')) stat.textContent=`解答済み ${countAnswered(lessonId)} / ${lesson().questions.length} · 正解 ${countCorrect(lessonId)}`;
  }
  function render() {
    if (!lessons.length) { content.textContent = '教材データを読み込めませんでした。'; return; }
    renderNav(); renderHeader(); updateHash();
    content.innerHTML = lessonId === 0 ? renderIntro() : ({words:renderWords,practice:renderPractice})[tab]();
    syncPlaybackUI();
  }
  // Shared audio player; the browser's native audio controls remain available.
  function syncPlaybackUI() {
    const labels={playing:'再生中',paused:'一時停止',stopped:'停止中',ended:'再生終了',error:'再生できません'};
    player.dataset.state=playbackState;
    $('#player-status').textContent=labels[playbackState];
    if (activeTrack) {
      const item=lessons[activeTrack.lessonId-1];
      const kind=activeTrack.group==='l'?'聴解':activeTrack.group==='p'?'表現':'単語';
      $('#player-subtitle').textContent=`${item.title} · ${kind} ${activeTrack.customUrl?'補助音声':activeTrack.name}`;
    }
    content.querySelectorAll('[data-play]').forEach(button=>{
      const same=activeTrack && activeTrack.lessonId===lessonId && button.dataset.play===activeTrack.group && button.dataset.name===activeTrack.name && (button.dataset.url||'')===activeTrack.customUrl;
      const playing=Boolean(same && playbackState==='playing');
      const paused=Boolean(same && playbackState==='paused');
      button.classList.toggle('is-playing',playing);
      button.classList.toggle('is-paused',paused);
      const icon=button.classList.contains('mini-play')?button:button.querySelector('.mini-play');
      if (icon) icon.textContent=playing?'Ⅱ':'▶';
      const action=playing?'一時停止':paused?'再開':'再生';
      if (!button.dataset.baseLabel) button.dataset.baseLabel=(button.getAttribute('aria-label')||button.dataset.title||'音声').replace(/(?:。発音)?を再生$/, '');
      button.setAttribute('aria-label',`${button.dataset.baseLabel}を${action}`);
      button.title=`押して${action}`;
    });
  }
  function stopPlayback() {
    playbackState='stopped';
    audio.pause();
    try { audio.currentTime=0; } catch {}
    syncPlaybackUI();
  }
  function play(group,name,title,customUrl) {
    const valid = customUrl ? customUrl.startsWith('assets/audio/') : ['l','p','t'].includes(group) && /^\d+(?:\.\d+)?$/.test(name);
    if (!valid) { $('#player-subtitle').textContent = '音声が見つかりません。'; player.hidden = false; return; }
    const url = customUrl || trackUrl(lessonId,group,name);
    const same=activeTrack && activeTrack.lessonId===lessonId && activeTrack.group===group && activeTrack.name===name && activeTrack.customUrl===(customUrl||'');
    if (same && playbackState==='playing') { audio.pause(); return; }
    activeTrack={lessonId,group,name,customUrl:customUrl||''};
    activeWord = group==='t' ? lesson().vocabulary.find(word => customUrl ? word.audioUrl===customUrl : word.audioTrack===name) || null : null;
    if (!same || !audio.src.endsWith(url)) audio.src = url;
    if (playbackState==='stopped' || playbackState==='ended') { try { audio.currentTime=0; } catch {} }
    $('#player-title').textContent = title || '音声';
    player.hidden = false;
    audio.playbackRate = Number($('#speed-select').value);
    audio.play().catch(error => { if (error.name==='AbortError' || playbackState==='paused' || playbackState==='stopped') return; if (activeTrack && activeTrack.lessonId===lessonId && activeTrack.group===group && activeTrack.name===name && audio.paused) { playbackState='error'; syncPlaybackUI(); } });
  }
  // One delegated handler also works for cards created after a view change.
  document.addEventListener('click', event => {
    const introButton = event.target.closest('[data-intro]');
    if (introButton) { lessonId=0; tab='words'; render(); scrollTo({top:0,behavior:'smooth'}); return; }
    const lessonButton = event.target.closest('[data-lesson]');
    if (lessonButton) { lessonId=Number(lessonButton.dataset.lesson); tab='words'; segment=1; render(); scrollTo({top:0,behavior:'smooth'}); return; }
    const tabButton = event.target.closest('[data-tab]');
    if (tabButton) { tab=tabButton.dataset.tab; render(); return; }
    const segmentButton = event.target.closest('[data-segment]');
    if (segmentButton) { segment=Number(segmentButton.dataset.segment); render(); $('#content').scrollIntoView({behavior:'smooth',block:'start'}); return; }
    const vocabToggle = event.target.closest('[data-vocab-toggle]');
    if (vocabToggle) {
      const key=vocabToggle.dataset.vocabToggle;
      if (!Object.prototype.hasOwnProperty.call(vocabVisible,key)) return;
      vocabVisible[key]=!vocabVisible[key];
      content.innerHTML=renderWords();
      if (activeWord && !player.hidden) $('#player-title').textContent=wordDisplayTitle(activeWord);
      syncPlaybackUI();
      const updated=content.querySelector(`[data-vocab-toggle="${key}"]`);
      if (updated) updated.focus({preventScroll:true});
      return;
    }
    const retryButton = event.target.closest('[data-retry]');
    if (retryButton) { const [first,last]=PART_RANGES[segment]; for(let n=first;n<=last;n++) clearAnswer(lessonId,n); render(); return; }
    const questionRetryButton = event.target.closest('[data-retry-question]');
    if (questionRetryButton) {
      const number=Number(questionRetryButton.dataset.retryQuestion);
      const card=questionRetryButton.closest('.question-card');
      const parent=card.parentElement;
      const grouped=Boolean(card.closest('.question-group'));
      clearAnswer(lessonId,number);
      card.outerHTML=renderQuestion(lesson().questions[number-1],grouped);
      updateProgress();
      syncPlaybackUI();
      const firstChoice=parent.querySelector(`[data-question="${number}"]`);
      if (firstChoice) {
        const nextCard=firstChoice.closest('.question-card');
        const group=nextCard.closest('.question-group');
        const replay=nextCard.querySelector('[data-play="l"]') || (group && group.querySelector('.question-group-head [data-play="l"]'));
        (replay || firstChoice).focus();
      }
      return;
    }
    const answerButton = event.target.closest('[data-answer]');
    if (answerButton) {
      const number=Number(answerButton.dataset.question);
      if (getAnswer(lessonId,number)) return;
      setAnswer(lessonId,number,answerButton.dataset.answer);
      const card=answerButton.closest('.question-card');
      card.outerHTML=renderQuestion(lesson().questions[number-1],Boolean(card.closest('.question-group')));
      updateProgress();
      syncPlaybackUI();
      return;
    }
    const playButton = event.target.closest('[data-play]');
    if (playButton) play(playButton.dataset.play,playButton.dataset.name,playButton.dataset.title,playButton.dataset.url);
  });
  $('#lesson-select').addEventListener('change',event => {lessonId=event.target.value==='intro'?0:Number(event.target.value);tab='words';segment=1;render();});
  $('#speed-select').addEventListener('change',event => {audio.playbackRate=Number(event.target.value);});
  $('#player-stop').addEventListener('click',stopPlayback);
  $('#player-close').addEventListener('click',()=>{stopPlayback();player.hidden=true;});
  audio.addEventListener('play',()=>{playbackState='playing';syncPlaybackUI();});
  audio.addEventListener('pause',()=>{if(playbackState!=='stopped' && playbackState!=='ended' && playbackState!=='error'){playbackState='paused';syncPlaybackUI();}});
  audio.addEventListener('ended',()=>{playbackState='ended';syncPlaybackUI();});
  audio.addEventListener('error',()=>{playbackState='error';syncPlaybackUI();$('#player-subtitle').textContent='音声を読み込めませんでした。';});
  window.addEventListener('hashchange',()=>{parseHash();render();});
  parseHash();render();
})();




