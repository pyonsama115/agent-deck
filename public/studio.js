'use strict';
(function () {
  const dialog=document.getElementById('motionStudio');
  const q=s=>dialog.querySelector(s);
  const motion=window.MotionScenes;
  const labels=motion.stateNames;
  let selected=motion.catalogue.find(v=>v.id==='construction'),agent='claude',paused=false,galleryMode='scenes';
  const selectOptions=(items,current)=>items.map(([value,label])=>`<option value="${value}"${String(value)===String(current)?' selected':''}>${label}</option>`).join('');
  dialog.innerHTML=`<div class="modal-card studio-card">
    <div class="studio-top"><div><h2 id="studioTitle">演出スタジオ</h2><p>${motion.catalogue.length}の場面 × ${MotionActors.models.length}のロボット。${motion.catalogue.length*MotionActors.models.length}通りの組み合わせ。</p></div><span class="spacer"></span><button class="btn" id="studioClose" aria-label="演出スタジオを閉じる">閉じる</button></div>
    <div class="studio-layout"><div class="studio-controls">
      <label>プレビューするエージェント<select id="studioAgent" aria-label="プレビューするエージェント">${selectOptions([['claude','Claude'],['codex','Codex']],'claude')}</select></label>
      <label>場面の絞り込み<select id="studioState" aria-label="場面の絞り込み">${selectOptions([['all','すべての状態'],...Object.entries(labels)],'agent')}</select></label>
      <label>場面を探す<input type="search" id="studioSearch" placeholder="ボール、工房、調査…"></label>
      <label>実働サブエージェント（プレビュー）<select id="studioCrew" aria-label="実働サブエージェント（プレビュー）">${selectOptions([['unknown','取得できない場合'],...[0,1,2,3,4,5,6,12].map(n=>[n,`${n}体${n>6?'（代表6体）':''}`])],4)}</select></label>
      <h3>ダッシュボードの設定</h3>
      <label>外観<select id="studioTheme" aria-label="外観">${selectOptions([['atelier','アトリエ'],['paper','ペーパー'],['midnight','ミッドナイト'],['original','オリジナル（時間帯連動）']],motion.settings.theme)}</select></label>
      <label>ロボットの姿<select id="studioLook" aria-label="ロボットの姿">${selectOptions([['auto','セッションごとにおまかせ'],...MotionActors.models.map(m=>[m.index,m.label])],motion.settings.look)}</select></label>
      <label>場面のセット<select id="studioVariant" aria-label="場面のセット">${selectOptions([['auto','アトリエの新しい場面'],['classic','従来の場面']],motion.settings.variant)}</select></label>
      <label>動きの量<select id="studioMotion" aria-label="動きの量">${selectOptions([['full','通常'],['calm','ゆっくり'],['paused','すべて停止']],motion.settings.motion)}</select></label>
      <label class="checkbox-row"><input type="checkbox" id="studioRotation"${motion.settings.rotation==='on'?' checked':''}>同じ作業が続いたら、約1分ごとに場面を変える</label>
      <button class="btn" id="studioShuffle">おまかせの組み合わせを変える</button>
    </div><div class="studio-content">
      <div class="studio-preview" id="studioPreview"></div>
      <div class="studio-caption"><div><h3 id="studioSceneName"></h3><p id="studioSceneInfo"></p></div><div class="studio-navigation"><button class="btn" id="studioPrev" aria-label="前の場面">←</button><button class="btn" id="studioPlay">一時停止</button><button class="btn" id="studioNext" aria-label="次の場面">→</button></div></div>
      <div class="studio-gallery-switch" role="group" aria-label="一覧の種類"><button type="button" class="btn" data-gallery="scenes" aria-pressed="true" aria-controls="studioGallery">場面一覧</button><button type="button" class="btn" data-gallery="models" aria-pressed="false" aria-controls="studioGallery">ロボット一覧</button><button type="button" class="btn" id="studioAutoLook">姿はセッションごとにおまかせ</button></div><p class="studio-label" id="studioCount"></p><div class="studio-gallery" id="studioGallery"></div>
      <p class="studio-explainer">チーム作業のロボットは実際の稼働数に合わせて表示します。7体以上は代表6体です。待機中に登場する「仲間」は遊びの演出で、実働数には含みません。外観・姿・動きの設定はこのブラウザに保存されます。OSの「動きを減らす」設定を優先します。</p>
    </div></div></div>`;
  function crewCount(){return q('#studioCrew').value==='unknown'?null:Number(q('#studioCrew').value);}
  function currentLook(){return motion.selection(selected.state,'studio').look;}
  function renderPreview(){
    q('#studioPreview').innerHTML=Scenes.buildScene(agent,selected.state,{variant:selected.index,look:currentLook(),seed:'studio',minis:crewCount()})+`<span class="preview-label">${agent==='claude'?'Claude':'Codex'} · ${labels[selected.state]}</span>`;
    q('#studioSceneName').textContent=selected.label;
    q('#studioSceneInfo').textContent=`${labels[selected.state]} · ${MotionActors.models[currentLook()].label} · ${selected.index===0?'従来の場面':'アトリエ'}${crewCount()===null?' · サブエージェント数は不明':''}`;
    dialog.classList.toggle('studio-paused',paused);
  }
  function filtered(){const state=q('#studioState').value,search=q('#studioSearch').value.trim();return motion.catalogue.filter(v=>(state==='all'||v.state===state)&&(!search||`${v.label} ${v.stateLabel}`.includes(search)));}
  function renderGallery(){
    dialog.querySelectorAll('[data-gallery]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.gallery===galleryMode)));
    q('#studioAutoLook').setAttribute('aria-pressed',String(motion.settings.look==='auto'));
    if(galleryMode==='models'){
      q('#studioCount').textContent=MotionActors.models.length+'のロボット · '+(motion.settings.look==='auto'?'セッションごとにおまかせ（プレビュー：'+MotionActors.models[currentLook()].label+'）':'選択中：'+MotionActors.models[currentLook()].label)+' · 選ぶとダッシュボードにも保存';
      q('#studioGallery').innerHTML=MotionActors.models.map(model=>'<button type="button" class="scene-tile" data-model-index="'+model.index+'" aria-pressed="'+(String(motion.settings.look)===String(model.index))+'"><div class="tile-art">'+Scenes.buildScene(agent,selected.state,{variant:selected.index,look:model.index,seed:'studio',minis:crewCount()})+'</div><span>'+model.label+'<small>'+selected.label+' · '+(agent==='claude'?'Claude':'Codex')+'</small></span></button>').join('');
      return;
    }
    const items=filtered();
    q('#studioCount').textContent=items.length+'の場面 · クリックでプレビュー';
    q('#studioGallery').innerHTML=items.length?items.map(v=>'<button type="button" class="scene-tile" data-scene-id="'+v.state+':'+v.index+'" aria-pressed="'+(v===selected)+'"><div class="tile-art">'+Scenes.buildScene(agent,v.state,{variant:v.index,look:currentLook(),seed:'studio',minis:crewCount()})+'</div><span>'+v.label+'<small>'+v.stateLabel+'</small></span></button>').join(''):'<p class="studio-empty">該当する場面がありません。検索語を変えてみてください。</p>';
  }
  function refresh(){renderPreview();renderGallery();}
  function revealPreview(){dialog.querySelector('.studio-layout').scrollTop=0;q('#studioPreview').scrollIntoView({block:'nearest',behavior:'instant'});}
  q('#studioGallery').addEventListener('click',e=>{
    const model=e.target.closest('[data-model-index]');
    if(model){q('#studioLook').value=model.dataset.modelIndex;motion.configure({look:model.dataset.modelIndex});refresh();revealPreview();return;}
    const tile=e.target.closest('[data-scene-id]');if(!tile)return;
    selected=motion.catalogue.find(v=>v.state+':'+v.index===tile.dataset.sceneId);refresh();revealPreview();
  });
  dialog.querySelectorAll('[data-gallery]').forEach(button=>button.addEventListener('click',()=>{galleryMode=button.dataset.gallery;renderGallery();}));
  q('.studio-gallery-switch').addEventListener('keydown',e=>{if(!e.target.dataset.gallery||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();galleryMode=e.key==='Home'?'scenes':e.key==='End'?'models':galleryMode==='scenes'?'models':'scenes';renderGallery();q('[data-gallery='+galleryMode+']').focus();});
  q('#studioAutoLook').addEventListener('click',()=>{q('#studioLook').value='auto';motion.configure({look:'auto'});refresh();});
  q('#studioAgent').addEventListener('change',()=>{agent=q('#studioAgent').value;refresh();});
  q('#studioState').addEventListener('change',()=>{const options=filtered();if(options.length&&!options.includes(selected))selected=options[0];refresh();});
  q('#studioSearch').addEventListener('input',renderGallery);
  q('#studioCrew').addEventListener('change',refresh);
  for(const [id,key] of [['Theme','theme'],['Look','look'],['Variant','variant'],['Motion','motion']])q('#studio'+id).addEventListener('change',()=>{motion.configure({[key]:q('#studio'+id).value});refresh();});
  q('#studioRotation').addEventListener('change',()=>motion.configure({rotation:q('#studioRotation').checked?'on':'off'}));
  q('#studioShuffle').addEventListener('click',()=>{motion.configure({seed:motion.settings.seed+1});refresh();});
  q('#studioPlay').addEventListener('click',()=>{paused=!paused;q('#studioPlay').textContent=paused?'再生':'一時停止';dialog.classList.toggle('studio-paused',paused);});
  function step(delta){const items=filtered();if(!items.length)return;let index=items.indexOf(selected);selected=items[(index+delta+items.length)%items.length];refresh();}
  q('#studioPrev').addEventListener('click',()=>step(-1));q('#studioNext').addEventListener('click',()=>step(1));
  const open=()=>{if(!dialog.open){refresh();dialog.showModal();}};
  document.getElementById('studioBtn').addEventListener('click',open);
  q('#studioClose').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select')||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key.toLowerCase()==='v'){e.preventDefault();dialog.open?dialog.close():open();}});
  const syncVisibility=()=>document.body.toggleAttribute('data-page-hidden',document.hidden);
  document.addEventListener('visibilitychange',syncVisibility);syncVisibility();
})();
