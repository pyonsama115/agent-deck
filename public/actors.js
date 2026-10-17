/* Articulated characters. Every model shares the same joint coordinates so that
   existing tool gestures and new ensemble choreography work for both providers. */
'use strict';
(function () {
  const MODELS = [
    ['classic', 'オリジナル'], ['pebble', 'ペブル'], ['box', 'ボックス'],
    ['capsule', 'カプセル'], ['cat', 'ネコ'], ['rabbit', 'ウサギ'],
    ['bear', 'クマ'], ['owl', 'フクロウ'], ['astronaut', '宇宙飛行士'],
    ['retro', 'レトロ'], ['cyclops', '一つ目'], ['sprout', '芽吹き'],
    ['diver', '潜水士'], ['chef', 'シェフ'], ['ranger', 'レンジャー'], ['courier', '配達員'],
  ].map(([id, label], index) => ({ id, label, index }));
  const rect = (x,y,w,h,r,fill,extra='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
  const circle = (x,y,r,fill,extra='') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
  function render(agent, o, props, palette) {
    const model = MODELS[Number(o.look)] || MODELS[1];
    const p = palette[agent] || palette.claude;
    const c = o.mini ? p.mini : p.main, d = o.mini ? p.miniDark : p.dark;
    const cream = '#f5e8c9', ink = '#233735', steel = '#a4b2af';
    let shell = '', face = '', crown = '', body = '', feet = '';
    const rounded = (radius=17) => rect(24,15,52,38,radius,c) + rect(29,21,42,26,Math.min(radius,12),ink);
    switch (model.id) {
      case 'pebble': shell = `<path d="M22 39 Q19 13 45 12 Q78 9 79 38 Q76 57 50 55 Q28 57 22 39" fill="${c}"/>`; face=rect(28,22,44,24,12,ink); body=rect(31,52,38,28,14,c); break;
      case 'box': shell=rect(22,14,56,40,4,c)+rect(27,20,46,28,2,ink); crown=rect(30,9,14,5,2,steel)+rect(56,9,14,5,2,steel); body=rect(30,53,40,26,4,c); break;
      case 'capsule': shell=rect(28,9,44,48,22,c); face=rect(31,23,38,22,11,ink); body=rect(34,52,32,28,15,c); feet=rect(29,84,18,7,3,d)+rect(53,84,18,7,3,d); break;
      case 'cat': shell=rounded(16); crown=`<path d="M25 26 L22 5 L41 17 M59 17 L78 5 L75 27" fill="${c}"/><path d="M27 17 L26 10 L34 17 M66 17 L74 10 L73 18" fill="${cream}"/>`; face=`<path d="M46 39 Q50 44 54 39 M25 36 l-8 -2 M25 41 l-8 2 M75 36 l8 -2 M75 41 l8 2" fill="none" stroke="${cream}" stroke-width="1.3"/>`; break;
      case 'rabbit': shell=rounded(19); crown=`<g class="ear-l">${rect(31,-4,12,27,6,c)}${rect(35,0,4,16,2,cream)}</g><g class="ear-r">${rect(57,-4,12,27,6,c)}${rect(61,0,4,16,2,cream)}</g>`; body=rect(33,51,34,30,16,c); break;
      case 'bear': crown=circle(27,17,11,d)+circle(73,17,11,d)+circle(27,17,6,cream)+circle(73,17,6,cream); shell=rounded(17); face=`<ellipse cx="50" cy="43" rx="10" ry="6" fill="${cream}"/>${circle(50,40,2.5,ink)}`; break;
      case 'owl': shell=`<path d="M23 13 L38 19 Q50 12 62 19 L77 13 L75 43 Q70 57 50 55 Q28 57 25 43 Z" fill="${c}"/>`; face=circle(39,33,12,cream)+circle(61,33,12,cream)+circle(39,33,8,ink)+circle(61,33,8,ink)+`<path d="M46 41 l4 6 l4 -6z" fill="#dfac60"/>`; body=`<path d="M31 51 Q22 81 50 82 Q78 81 69 51Z" fill="${c}"/>`; break;
      case 'astronaut': shell=circle(50,31,28,cream)+circle(50,31,23,steel)+rect(29,17,42,31,15,ink); crown=`<path d="M34 21 Q43 13 57 17" fill="none" stroke="#fff" stroke-width="2" opacity=".5"/>`; body=rect(30,52,40,29,8,cream)+rect(37,56,26,17,3,c); break;
      case 'retro': shell=rect(20,13,60,42,7,d)+rect(24,17,52,34,5,c)+rect(29,21,42,25,8,ink); crown=rect(16,26,5,16,2,steel)+rect(79,26,5,16,2,steel)+`<path d="M37 13 l-7 -10 M63 13 l7 -10" stroke="${steel}" stroke-width="2"/>`; body=rect(29,54,42,24,3,c)+rect(35,60,30,11,2,ink); break;
      case 'cyclops': shell=circle(50,32,27,c); face=circle(50,31,19,ink)+circle(50,31,12,cream)+circle(51,31,7,d)+circle(53,28,3,'#fff'); body=rect(34,55,32,26,9,c); break;
      case 'sprout': shell=rounded(20); crown=`<path d="M50 16 V3" stroke="#8eaa7b" stroke-width="3"/><path class="leaf" d="M50 8 Q30 8 34 -3 Q50 -4 50 8 Q51 -7 66 -2 Q65 10 50 8" fill="#96b985"/>`; body=`<path d="M29 52 H71 L65 80 H35Z" fill="#bb8461"/><path d="M29 54 h42" stroke="${cream}" stroke-width="3"/>`; break;
      case 'diver': shell=circle(50,32,28,d)+circle(50,32,23,c)+circle(50,32,17,ink); crown=[0,1,2,3].map(i=>circle(50+24*Math.cos(i*Math.PI/2),32+24*Math.sin(i*Math.PI/2),2,cream)).join('')+`<path d="M77 35 Q91 39 83 62" fill="none" stroke="${steel}" stroke-width="4"/>`; body=rect(31,55,38,25,8,d); break;
      case 'chef': shell=rounded(15); crown=`<path d="M28 17 L28 6 Q19 -7 34 -8 Q41 -19 50 -10 Q64 -18 69 -7 Q82 -7 73 7 V17Z" fill="${cream}"/>${rect(28,10,45,8,2,'#e4d8bd')}`; body=rect(31,52,38,28,8,cream)+`<path d="M44 53 v24 M56 53 v24" stroke="${c}" stroke-width="2"/>`; break;
      case 'ranger': shell=rounded(15); crown=`<path d="M17 17 H83 V21 H17Z M29 16 L34 1 H65 L71 16Z" fill="#9f8b62"/><path d="M33 11 H68" stroke="#504c3d" stroke-width="5"/>`; body=rect(30,52,40,28,7,'#9f8b62')+rect(43,55,14,21,2,c); break;
      case 'courier': shell=rounded(14); crown=`<path d="M25 19 Q23 -2 55 1 Q75 3 75 19Z" fill="#7c98a1"/><path d="M43 16 h42 q8 6 -5 7 H43Z" fill="#9fb8bc"/>`; body=rect(31,52,38,28,8,c)+`<path d="M29 54 L68 78" stroke="#73523e" stroke-width="6"/>`+rect(59,64,20,18,4,'#a97c55'); break;
      default: shell=rounded();
    }
    const eyeColor = model.id==='owl' ? '#233735' : '#f5ead4';
    const eyes = model.id==='cyclops' ? '' : model.id==='retro' || model.id==='box'
      ? rect(35,27,8,8,1,eyeColor)+rect(57,27,8,8,1,eyeColor)
      : `<ellipse cx="39" cy="32" rx="3.5" ry="5" fill="${eyeColor}"/><ellipse cx="61" cy="32" rx="3.5" ry="5" fill="${eyeColor}"/>`;
    const mouth = ['owl','bear','cyclops','cat'].includes(model.id) ? '' : `<path d="M46 41 Q50 44 54 41" fill="none" stroke="${cream}" stroke-width="1.5" stroke-linecap="round"/>`;
    const chest = rect(41,58,18,12,4,ink)+circle(50,64,2.5,cream);
    return `<g class="bot model-${model.id}"><ellipse class="shadow" cx="50" cy="94" rx="24" ry="3" fill="#000" opacity=".18"/><g class="body-grp">
      ${rect(36,73,10,17,5,d,'class="leg-l"')}${rect(54,73,10,17,5,d,'class="leg-r"')}${feet}
      <g class="arm-l">${rect(22,54,9,20,4.5,d)}${circle(26.5,75,4.5,c)}</g>
      ${body || rect(31,52,38,28,10,c)}${['chef','sprout','courier'].includes(model.id)?'':chest}
      <g class="head">${crown}${shell}${face}<g class="eyes-pos"><g class="eyes">${eyes}</g></g>${mouth}
      <g class="xeyes" stroke="#d4756c" stroke-width="2"><path d="M35 27 l8 9 M43 27 l-8 9 M57 27 l8 9 M65 27 l-8 9"/></g><path class="sweat" d="M77 22 q5 7 0 9 q-5 -2 0 -9z" fill="#b3d4d9"/></g>
      ${o.laptop ? `<g class="laptop">${rect(25,65,50,21,3,'#40504f')}${rect(20,85,60,4,2,steel)}<path d="M45 73 l-4 3 l4 3 M55 73 l4 3 l-4 3" fill="none" stroke="${cream}"/></g>` : ''}
      <g class="arm-r">${rect(69,54,9,20,4.5,d)}${circle(73.5,75,4.5,c)}${o.prop && props[o.prop] ? `<g class="prop prop-${o.prop}">${props[o.prop]}</g>` : ''}</g>
      ${o.box ? rect(30,60,40,26,3,'#b78d65')+`<path d="M30 68 h40 M50 60 v26" stroke="#816648" stroke-width="2"/>` : ''}
    </g></g>`;
  }
  window.MotionActors = { models: MODELS, render };
})();
