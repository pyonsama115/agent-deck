/* Authored dioramas, stable scene selection and ensemble choreography.
   No timers or external assets: animation is CSS and shares the app's pause rules. */
'use strict';
(function () {
  const oldBuild = Scenes.buildScene;
  const R = (x,y,w,h,c,r=3,extra='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${c}" ${extra}/>`;
  const C = (x,y,r,c,extra='') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${extra}/>`;
  const E = (x,y,rx,ry,c) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${c}"/>`;
  const L = (d,c='#82928a',w=2,extra='') => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
  const T = (x,y,t,c='#dce0d4',size=9) => `<text x="${x}" y="${y}" fill="${c}" font-size="${size}" font-family="ui-monospace,monospace">${t}</text>`;
  const G = (cls,svg,style='') => `<g class="${cls}"${style ? ` style="${style}"` : ''}>${svg}</g>`;
  const wood='#9e7956', paper='#e4dcc5', ink='#334640', sage='#9fbb96', blue='#91aeb6', coral='#c88f75', gold='#d9b86c';
  const desk = (x=153,y=112,w=187) => R(x,y,w,7,wood,2)+R(x+10,y+7,5,22,wood,1)+R(x+w-15,y+7,5,22,wood,1);
  const pot = (x,y,s=1) => `<g transform="translate(${x} ${y}) scale(${s})">${L('M0 0 V-22','#82996d',2)}<path class="leaf" d="M0 -10 Q-22 -14 -16 -28 Q1 -28 0 -10 Q3 -35 18 -31 Q24 -16 0 -10" fill="${sage}"/>${R(-10,0,20,18,coral,3)}${R(-12,-2,24,5,wood,2)}</g>`;
  const lamp = (x,y) => L(`M${x} ${y} v-46 l16 -17`,'#a4b2a0',3)+`<path d="M${x+5} ${y-57} l20 -12 l10 18 l-28 7Z" fill="${gold}"/>`+E(x+22,y-22,28,18,'#d9b86c15');
  const screen = (x,y,w=100,h=67) => R(x,y,w,h,'#52665d',5)+R(x+4,y+4,w-8,h-10,'#24352f',3)+R(x+w/2-3,y+h,6,12,wood,1)+R(x+w/2-20,y+h+10,40,4,wood,1);
  const book = (x,y,w=65,h=43) => `<path d="M${x} ${y} q${w/4} -8 ${w/2} 0 q${w/4} -8 ${w/2} 0 v${h} q-${w/4} -7 -${w/2} 0 q-${w/4} -7 -${w/2} 0Z" fill="${paper}"/>`+L(`M${x+w/2} ${y} v${h}`,wood,1)+[0,1,2].map(i=>L(`M${x+7} ${y+10+i*8} h${w/2-14} M${x+w/2+7} ${y+10+i*8} h${w/2-14}`,'#9b9c86',1)).join('');
  const windowPane = (x=220,y=8,night=false) => R(x,y,113,84,'#4b5e56',8)+R(x+5,y+5,103,74,night?'#273d4b':'#a8beb1',5)+L(`M${x+56} ${y+5} v74 M${x+5} ${y+43} h103`,'#4b5e56',4)+(night?C(x+83,y+25,10,paper)+C(x+87,y+21,10,'#273d4b'):C(x+83,y+25,12,'#e5ce94'));
  const dots = (x,y) => [0,1,2].map(i=>C(x+i*9,y,2,sage,`class="m-dot" style="--i:${i}"`)).join('');
  const star = (x,y,r=5,c=gold) => `<path d="M${x} ${y-r} l${r*.3} ${r*.7} l${r*.7} ${r*.3} l-${r*.7} ${r*.3} l-${r*.3} ${r*.7} l-${r*.3} -${r*.7} l-${r*.7} -${r*.3} l${r*.7} -${r*.3}Z" fill="${c}"/>`;
  const block = (x,y,c=sage) => R(x,y,22,18,c,3)+L(`M${x+6} ${y+5} h10 M${x+6} ${y+10} h6`,'#fff7',1);
  const envelope = (x,y) => R(x,y,33,22,paper,2)+L(`M${x} ${y} l16.5 12 l16.5 -12`,wood,1);
  const board = (x=180,y=18,w=147,h=88) => R(x,y,w,h,paper,5)+R(x+4,y+4,w-8,h-8,'#d2d2b5',2)+L(`M${x+14} ${y+h} l-8 30 M${x+w-14} ${y+h} l8 30`,wood,3);
  const shelf = () => [0,1,2].map(row=>R(164,38+row*34,173,4,wood,1)+[0,1,2,3,4,5,6].map(i=>R(169+i*23,17+row*34,17,21,[paper,sage,coral,blue][(i+row)%4],2)).join('')).join('');
  const V = (id,label,build) => ({id,label,build});
  const authored = {
    think: [
      V('star-map','星図をたどる',p=>({pose:'ponder',prop:'pointer',back:board()+L('M204 74 l23 -34 l31 24 l35 -30 l15 41',blue,1)+[[204,74],[227,40],[258,64],[293,34],[308,75]].map(([x,y],i)=>G('m-twinkle',star(x,y,4,p.main),`--i:${i}`)).join('')+T(194,95,'IDEA / 03',ink)})),
      V('balance','アイデアの積み木',p=>({pose:'ponder',back:desk()+G('m-balance',block(217,90,p.main)+block(237,72,paper)+block(221,54,sage)+block(242,36,coral))+pot(315,94,.7)+dots(158,38)})),
      V('greenhouse','温室でひらめく',p=>({pose:'ponder',back:windowPane()+desk()+pot(205,94,.9)+pot(264,94,1.4)+G('m-twinkle',star(271,19,8))+R(160,94,31,18,paper,2)+L('M166 100 h19 M166 105 h13',wood,1)})),
    ],
    read: [
      V('library','図書机で読み込む',p=>({pose:'read',prop:'magnifier',back:windowPane()+desk()+book(192,65,80,45)+lamp(305,110)+R(158,95,25,17,coral,2)+L('M163 99 h15',paper,1)})),
      V('specimens','標本を見比べる',p=>({pose:'read',prop:'magnifier',back:shelf()+G('m-scan',R(164,45,173,3,p.main,1))+T(169,132,'REFERENCE ARCHIVE',paper,8)})),
      V('archive','資料を仕分ける',p=>({pose:'sort',back:desk()+[0,1,2].map(i=>G('m-sort',R(165+i*55,66+i*7,43,36,[paper,sage,blue][i],2)+L(`M${171+i*55} ${75+i*7} h29 M${171+i*55} ${82+i*7} h20`,ink,1),`--i:${i}`)).join('')+T(225,27,'A → B → C',paper)})),
    ],
    edit: [
      V('code-bricks','コードを積み上げる',p=>({pose:'hammer',prop:'hammer',back:desk()+[0,1,2,3,4].map(i=>block(179+(i%3)*29,93-Math.floor(i/3)*22,[sage,p.main,paper,blue,coral][i])).join('')+G('m-lift',block(237,45,p.main))+pot(318,94,.7)})),
      V('tailor','コードを縫い合わせる',p=>({pose:'craft',prop:'wrench',back:desk()+R(187,64,105,45,paper,4)+L('M195 87 q14 -20 27 0 t27 0 t27 0',p.main,2,'class="m-stitch"')+L('M307 30 v59',steelColor(),3)+C(307,37,7,p.main)+G('m-sway',L('M307 44 q-20 15 -17 40',paper,1))})),
      V('printshop','小さな活版工房',p=>({pose:'craft',prop:'wrench',back:R(190,26,117,74,'#61756a',5)+R(200,32,97,13,ink,2)+G('m-press',R(206,49,85,12,wood,1))+R(210,74,76,40,paper,2)+T(221,91,'&lt;/&gt;',ink,16)+desk()+G('m-sheet',R(300,92,34,18,paper,1))})),
    ],
    shell: [
      V('terminal-desk','ターミナルの机',p=>({pose:'type',laptop:true,back:windowPane()+desk()+screen(185,32,112,67)+[0,1,2,3].map(i=>G('m-terminal',T(194,48+i*12,'&gt; '+['run','build','test','done'][i],i===3?sage:paper),`--i:${i}`)).join('')+pot(321,94,.65)})),
      V('server-garden','サーバーの手入れ',p=>({pose:'inspect',prop:'wrench',back:[0,1,2].map(i=>R(180+i*51,31,44,92,ink,5)+[0,1,2,3].map(j=>R(186+i*51,40+j*20,32,13,'#60746b',2)+C(211+i*51,46+j*20,2,sage,`class="m-dot" style="--i:${j+i}"`)).join('')).join('')+L('M180 130 h151',wood,3)})),
      V('test-track','テストの走行台',p=>({pose:'type',laptop:true,back:board()+[0,1,2,3].map(i=>L(`M194 ${39+i*17} h120`,'#a3ad94',1)+G('m-check',L(`M199 ${35+i*17} l4 4 l7 -9`,ink,2),`--i:${i}`)).join('')+G('m-train',R(183,115,34,15,p.main,3)+C(190,132,3,ink)+C(211,132,3,ink))+L('M165 136 h178',wood,2)})),
    ],
    web: [
      V('observatory','観測所で調べる',p=>({pose:'inspect',prop:'remote',back:windowPane(215,5,true)+L('M256 77 l-20 59 M256 77 l20 59',wood,3)+`<g class="m-telescope">${L('M222 65 l67 -26',blue,14)}${L('M216 67 l13 -5',paper,18)}</g>`+[0,1,2].map(i=>G('m-twinkle',star(170+i*25,20+(i%2)*20,3),`--i:${i}`)).join('')})),
      V('map-room','地図のピンを結ぶ',p=>({pose:'inspect',prop:'pointer',back:board()+`<path d="M201 35 l25 8 l12 -8 l23 13 l30 -12 l24 15 l-10 33 l-28 -5 l-26 14 l-24 -18 l-25 6Z" fill="${sage}"/>`+L('M220 55 Q244 30 273 64 T303 54',ink,1,'stroke-dasharray="3 4" class="m-route"')+[220,273,303].map((x,i)=>C(x,[55,64,54][i],4,p.main)).join('')})),
      V('radio','世界の声を受信',p=>({pose:'listen',prop:'remote',back:desk()+R(192,52,108,60,wood,6)+R(199,60,94,20,ink,3)+[0,1,2,3,4,5,6].map(i=>R(204+i*12,65,5,10,paper,1)).join('')+C(219,96,10,ink)+C(276,96,10,ink)+L('M280 52 l17 -35',blue,3)+G('m-signal',L('M304 21 q17 12 0 24 M313 15 q26 18 0 36',sage,2))+pot(325,94,.65)})),
    ],
    browser: [
      V('usability','操作をひとつずつ確認',p=>({pose:'inspect',prop:'remote',back:screen(174,21,162,92)+R(182,29,146,12,wood,2)+R(183,48,54,46,sage,3)+R(245,48,73,5,paper,2)+R(245,60,54,4,blue,2)+R(245,77,57,16,p.main,4)+G('m-click',L('M279 88 l0 -12 l10 8 l-5 1 l3 6',paper,2))+desk()})),
      V('layout','レイアウトを整える',p=>({pose:'craft',prop:'pointer',back:board()+G('m-layout-a',R(193,31,44,59,coral,3))+G('m-layout-b',R(244,31,67,24,sage,3))+G('m-layout-c',R(244,61,67,29,blue,3))+L('M190 98 h125',ink,1)})),
      V('device-lab','いろんな画面で検証',p=>({pose:'inspect',prop:'remote',back:desk()+screen(176,32,108,70)+R(265,59,46,53,ink,5)+R(269,65,38,40,sage,2)+R(308,75,23,37,ink,4)+R(311,80,17,26,p.main,2)+G('m-scan',L('M181 51 h96 M273 78 h30 M313 89 h13',paper,2))})),
    ],
    plan: [
      V('sticky-wall','付箋を並べ替える',p=>({pose:'direct',prop:'pointer',back:board()+[0,1,2,3,4,5].map(i=>G('m-note',R(194+(i%3)*41,31+Math.floor(i/3)*32,31,24,[gold,sage,coral][i%3],1)+L(`M${199+(i%3)*41} ${39+Math.floor(i/3)*32} h20`,ink,1),`--i:${i}`)).join('')})),
      V('blueprint','設計図をひろげる',p=>({pose:'ponder',prop:'pointer',back:desk()+R(171,41,154,68,blue,3)+L('M182 53 h132 v42 H182Z M222 53 v42 M271 53 v42 M182 74 h132',paper,1)+C(244,74,9,'none',`stroke="${paper}"`)+G('m-scan',L('M174 47 v57',paper,2))+R(166,36,10,77,paper,4)+R(321,36,10,77,paper,4)})),
      V('route','道筋を描いて相談',p=>({pose:'direct',prop:'pointer',back:board()+L('M204 79 v-38 h47 v37 h48 v-37',ink,2,'class="m-route" stroke-dasharray="4 3"')+[[204,79],[204,41],[251,41],[251,78],[299,78],[299,41]].map(([x,y],i)=>G('m-dot',C(x,y,6,i===5?p.main:sage),`--i:${i}`)).join('')})),
    ],
    mcp: [
      V('workshop','道具のワークショップ',p=>({pose:'craft',prop:'wrench',back:desk()+R(188,18,135,66,wood,4)+[0,1,2,3].map(i=>L(`M${201+i*32} 31 v30`,paper,4)+C(201+i*32,29,6,'none',`stroke="${paper}" stroke-width="3"`)).join('')+G('m-press',R(225,91,58,17,p.main,4))+pot(321,99,.5)})),
      V('railway','ツールをつなぐ鉄道',p=>({pose:'direct',prop:'remote',back:L('M155 114 h187 M155 125 h187',wood,2)+[0,1,2,3,4,5,6,7].map(i=>L(`M${163+i*24} 111 v18`,wood,2)).join('')+G('m-train',R(170,78,38,30,p.main,4)+R(177,64,20,19,p.main,3)+R(183,68,10,11,ink,1)+C(179,109,6,ink)+C(201,109,6,ink)+R(215,88,32,20,sage,2)+C(222,110,5,ink)+C(242,110,5,ink))+G('m-steam',C(181,56,5,paper)+C(176,43,7,paper))})),
      V('chemistry','小さな実験室',p=>({pose:'inspect',prop:'magnifier',back:desk()+[0,1,2].map(i=>`<g transform="translate(${183+i*54} 0)">${R(7,58,12,28,paper,2)}<path d="M7 79 L-1 103 Q-3 110 5 111 H22 Q30 110 27 103 L19 79Z" fill="${[sage,blue,p.main][i]}"/>${G('m-bubble',C(11,96,2,paper)+C(17,105,2,paper),`--i:${i}`)}</g>`).join('')+R(312,42,4,66,wood,1)+L('M303 43 h22',wood,3)})),
    ],
    agent: [
      V('construction','みんなで組み立てる',p=>({pose:'direct',prop:'megaphone',crew:'build',back:L('M166 30 v100 M332 30 v100 M166 34 h166 M166 71 h166',wood,3)+L('M174 35 l150 90 M324 35 l-150 90',wood,1)+R(172,72,154,5,wood,1)+[0,1,2,3,4].map(i=>block(183+i*25,116,[sage,p.main,paper,blue,coral][i])).join('')})),
      V('research-team','分担して調べもの',p=>({pose:'direct',prop:'pointer',crew:'research',back:board(175,7,160,65)+L('M191 28 h129 M191 42 h86 M191 55 h110',ink,2)+desk(151,132,190)})),
      V('mission-control','指揮室のチームワーク',p=>({pose:'direct',prop:'remote',crew:'mission',back:screen(178,8,155,68)+L('M190 57 l20 -22 l22 11 l23 -20 l22 20 l20 -9 l23 8',sage,2,'class="m-route" stroke-dasharray="150"')+dots(294,65)+R(154,126,190,8,wood,2)})),
    ],
    waiting: [
      V('mailbox','ポストの前でお返事待ち',p=>({pose:'wave',back:windowPane(218,7)+R(267,66,7,70,wood,1)+R(228,46,84,45,coral,14)+R(234,64,51,4,ink,1)+G('m-envelope',envelope(179,72))+pot(325,117,.7)})),
      V('tea-break','お茶を淹れて待つ',p=>({pose:'listen',back:desk()+R(199,86,31,23,paper,5)+L('M230 90 q19 -3 10 13 h-10',paper,3)+G('m-steam',L('M208 77 q-5 -7 0 -13 M220 78 q-5 -7 0 -13',paper,1))+R(263,89,50,19,coral,5)+R(279,79,16,10,coral,2)+pot(321,67,.7)})),
      V('doorbell','ドアベルを鳴らす',p=>({pose:'wave',back:R(220,10,94,128,wood,4)+R(227,17,80,121,'#687f70',2)+R(239,29,55,37,paper,3)+T(246,52,'HELLO',ink,12)+C(294,87,4,gold)+G('m-ring',C(195,57,10,gold)+L('M177 49 q-7 8 0 16 M213 49 q7 8 0 16',paper,2))+pot(334,115,.7)})),
    ],
    yourturn: [
      V('delivery','できたものをお届け',p=>({pose:'celebrate',prop:'flag',back:desk()+R(199,66,80,46,wood,3)+R(194,60,90,13,coral,3)+L('M239 60 v52',gold,6)+G('m-confetti',[0,1,2,3,4].map(i=>star(173+i*34,20+(i%2)*15,4,[gold,sage,paper][i%3])).join(''))+T(211,92,'DONE',paper,13)})),
      V('gallery','完成品を飾る',p=>({pose:'celebrate',back:R(189,15,130,100,wood,4)+R(196,22,116,86,paper,2)+R(207,34,94,61,blue,1)+`<path d="M207 95 l26 -32 l20 15 l24 -32 l24 49Z" fill="${sage}"/>`+C(228,49,10,gold)+G('m-twinkle',star(321,25,8))+pot(326,124,.6)})),
      V('finish-line','ゴールで旗を振る',p=>({pose:'celebrate',prop:'flag',back:L('M183 20 v114 M321 20 v114',wood,3)+R(183,20,138,22,paper,1)+Array.from({length:14},(_,i)=>R(184+(i%7)*19.5,21+Math.floor(i/7)*10,19.5,10,i%2?ink:paper,0)).join('')+L('M158 135 h184',sage,2)+G('m-confetti',star(192,64,5)+star(299,75,6)+star(259,105,4))})),
    ],
    standby: [
      V('ball-game','仲間とキャッチボール',p=>({pose:'play',companions:'ball',back:windowPane(220,5)+pot(326,117,.8)+G('m-ball',C(223,84,9,gold)+L('M217 78 l12 12 M218 90 l12 -12',wood,1))+L('M160 135 h174',sage,2)})),
      V('board-game','仲間とボードゲーム',p=>({pose:'play',companions:'chess',back:desk(145,111,180)+R(191,93,87,17,paper,2)+Array.from({length:12},(_,i)=>R(193+(i%6)*14,94+Math.floor(i/6)*7,14,7,(i+Math.floor(i/6))%2?wood:paper,0)).join('')+G('m-chess',C(221,87,4,p.main)+R(218,89,6,7,p.main,1))+C(251,89,4,ink)+pot(327,95,.65)})),
      V('hide-seek','仲間とかくれんぼ',p=>({pose:'peek',companions:'hide',back:windowPane(210,5)+R(200,82,49,53,wood,3)+L('M200 94 h49 M224 82 v53',paper,1)+pot(302,106,1.45)+G('m-butterfly',L('M170 34 q-12 -14 -16 -4 q-5 14 15 8 q16 10 20 -2 q3 -12 -17 -3',gold,3))})),
    ],
    error: [
      V('repair','工具を持って原因探し',p=>({pose:'inspect',prop:'wrench',back:desk()+R(200,50,103,60,ink,5)+L('M213 78 l20 -13 l17 28 l18 -22 l22 9',coral,2)+G('m-steam',C(287,39,5,paper)+C(295,26,7,paper))+R(173,98,26,13,coral,2)+T(217,103,'CHECK',paper,9)})),
      V('first-aid','救急箱を開ける',p=>({pose:'craft',prop:'wrench',back:desk()+R(199,68,92,44,paper,5)+R(216,49,58,24,coral,3)+L('M245 78 v22 M234 89 h22',coral,6)+G('m-dot',C(314,62,10,coral))+L('M314 55 v9 M314 68 v1',paper,2)})),
      V('detour','迂回路を考える',p=>({pose:'ponder',prop:'pointer',back:board()+L('M196 80 h111',coral,3)+R(246,62,17,34,wood,2)+L('M210 80 v-35 h78 v35',sage,2,'class="m-route" stroke-dasharray="3 4"')+T(219,35,'PLAN B',ink,10)})),
    ],
    stale: [
      V('antenna','アンテナを調整する',p=>({pose:'inspect',prop:'wrench',back:L('M257 58 v77 M257 58 l-28 -33 M257 58 l28 -33',wood,4)+`<path d="M218 20 Q257 80 296 20" fill="${blue}"/>`+G('m-signal',L('M308 15 q22 16 0 33',paper,2))+R(219,113,76,22,ink,3)+dots(245,124)})),
      V('lost-letter','届かない便りを探す',p=>({pose:'read',prop:'magnifier',back:desk()+[0,1,2].map(i=>envelope(178+i*48,72+(i%2)*16)).join('')+G('m-question',T(268,41,'?',gold,28))+pot(327,96,.6)})),
      V('lighthouse','灯台から合図を送る',p=>({pose:'wave',prop:'remote',back:`<path d="M246 52 H280 L290 134 H236Z" fill="${paper}"/>`+R(241,25,44,29,wood,3)+R(245,29,36,20,gold,2)+L('M236 24 l27 -18 l27 18Z',wood,3)+G('m-beam',`<path d="M245 30 L159 12 V69 L245 48Z" fill="#d9b86c25"/>`)+L('M157 136 q20 -8 40 0 t40 0 t40 0 t40 0',blue,3)})),
    ],
    interrupted: [
      V('bookmark','しおりを挟んでひと休み',p=>({pose:'read',back:desk()+book(194,64,92,47)+`<path d="M246 63 v32 l7 -5 l7 5 V63Z" fill="${coral}"/>`+lamp(315,111)+R(163,95,21,17,paper,4)})),
      V('bench','ベンチで小休止',p=>({pose:'rest',back:windowPane(213,5)+R(163,91,170,9,wood,2)+R(163,61,170,18,wood,2)+R(174,100,6,35,wood,1)+R(317,100,6,35,wood,1)+pot(337,119,.6)+G('m-leaf',`<path d="M204 38 q-14 -11 -20 1 q10 9 20 -1" fill="${sage}"/>`)})),
      V('pause-station','再開まで充電',p=>({pose:'rest',back:R(207,31,91,98,'#586e60',7)+R(220,47,65,37,ink,3)+R(231,55,38,20,paper,2)+R(269,61,4,9,paper,1)+L('M245 59 l-7 8 h9 l-6 9',sage,2)+G('m-cable',L('M222 112 Q185 141 166 110',wood,4))+T(222,102,'PAUSE',paper,11)})),
    ],
  };
  // Longer idle stories and distinct collaborative workshops.
  authored.standby.push(
    V('kite','仲間と凧あげ',p=>({pose:'play',companions:'kite',back:L('M157 135 h188',sage,2)+G('m-kite',`<path d="M259 9 L282 29 L262 58 L240 30Z" fill="${coral}"/>`+L('M259 9 l3 49 M240 30 l42 -1',paper,1)+L('M262 58 Q248 81 277 93 T275 119',paper,1))+L('M270 116 Q229 73 168 76',wood,1)+pot(330,116,.6)})),
    V('fishing','池でのんびり釣り',p=>({pose:'rest',companions:'fish',back:E(240,127,94,13,'#6d929b')+L('M130 88 l62 -55',wood,3)+L('M192 33 Q220 63 225 122',paper,1)+G('m-float',C(225,121,3,coral)+L('M215 125 q10 4 20 0',paper,1))+`<path d="M307 121 q11 -9 19 0 l8 -5 v10 l-8 -5" fill="${gold}"/>`+R(158,109,22,23,wood,3)})),
    V('painting','お互いの似顔絵',p=>({pose:'craft',companions:'paint',prop:'pointer',back:L('M225 33 l-20 101 M245 33 l20 101',wood,3)+R(207,35,61,67,wood,3)+R(212,40,51,56,paper,1)+C(237,60,12,p.main)+R(226,75,22,16,p.main,5)+C(233,59,2,ink)+C(242,59,2,ink)+R(199,102,76,5,wood,1)+G('m-twinkle',star(277,35,6))})),
    V('garden-club','ふたりの小さな菜園',p=>({pose:'craft',companions:'garden',prop:'remote',back:R(167,112,158,24,wood,3)+[0,1,2,3].map(i=>pot(188+i*36,105,.7+(i%2)*.3)).join('')+G('m-water',L('M177 78 l5 9 M186 78 l5 9 M195 78 l5 9',blue,2))+C(309,22,13,gold)})),
    V('book-club','仲間と読書会',p=>({pose:'read',companions:'book',back:windowPane(219,5,true)+desk()+book(184,75,80,36)+R(290,94,23,17,paper,4)+lamp(321,109)+G('m-page',L('M218 73 q-12 -10 -5 -26 q10 8 11 24',paper,3))})),
    V('picnic','芝生でピクニック',p=>({pose:'rest',companions:'picnic',back:`<path d="M146 122 l28 -28 h135 l30 28Z" fill="${coral}"/>`+L('M169 103 h147 M155 115 h177 M194 95 l-12 27 M233 95 v27 M272 95 l13 27',paper,2)+R(229,83,32,19,wood,3)+L('M236 84 q9 -21 18 0',wood,3)+C(213,99,5,gold)+pot(326,113,.6)})),
    V('cooking','仲間とスープづくり',p=>({pose:'craft',companions:'cook',prop:'pointer',back:desk()+R(201,91,80,19,ink,3)+R(215,65,51,30,wood,8)+L('M210 73 h-8 M267 73 h8',wood,4)+G('m-steam',L('M227 57 q-6 -10 0 -18 M244 57 q-6 -10 0 -18 M258 57 q-6 -10 0 -18',paper,1))+R(302,92,24,17,paper,4)})),
    V('music','仲間とセッション',p=>({pose:'music',companions:'music',back:L('M186 38 v99 M171 38 h31 M170 100 h35',wood,2)+R(165,19,46,23,paper,3)+L('M174 27 h28 M174 32 h28',ink,1)+G('m-notes',T(222,48,'♪',gold,22)+T(268,25,'♫',paper,20)+T(308,64,'♪',sage,17))+R(211,112,56,9,wood,2)+R(220,120,4,15,wood,1)+R(254,120,4,15,wood,1)})),
    V('paper-plane','紙飛行機を飛ばす',p=>({pose:'play',companions:'plane',back:windowPane()+desk()+R(188,97,35,14,paper,1)+G('m-plane',`<path d="M159 53 l42 -9 l-23 26 l-3 -13Z" fill="${paper}"/>`+L('M175 57 l26 -13',wood,1))+L('M162 79 q48 -4 65 -30',blue,1,'stroke-dasharray="2 4"')})),
    V('star-party','望遠鏡で星を探す',p=>({pose:'inspect',companions:'stars',prop:'remote',back:windowPane(211,5,true)+[0,1,2,3,4].map(i=>G('m-twinkle',star(170+i*37,16+(i%3)*19,3),`--i:${i}`)).join('')+L('M253 83 l-18 50 M253 83 l18 50',wood,3)+L('M229 78 l47 -20',blue,12)+R(158,121,43,12,wood,2)})),
    V('block-party','みんなで積み木遊び',p=>({pose:'play',companions:'blocks',back:desk()+[0,1,2,3,4,5].map(i=>block(180+(i%3)*27,93-Math.floor(i/3)*23,[paper,coral,sage,blue,p.main,gold][i])).join('')+G('m-balance',block(207,45,gold))+pot(328,97,.6)})),
    V('toy-race','おもちゃのレース',p=>({pose:'play',companions:'race',prop:'remote',back:L('M153 108 h187 M153 134 h187',wood,2)+L('M156 121 h182',paper,1,'stroke-dasharray="6 8"')+G('m-racer-a',R(169,96,34,12,coral,5)+C(176,110,4,ink)+C(198,110,4,ink))+G('m-racer-b',R(190,121,30,10,sage,4)+C(195,132,3,ink)+C(215,132,3,ink))+L('M330 90 v45',wood,2)+R(331,90,14,12,paper,1)})),
  );
  authored.agent.push(
    V('shipping','分担して荷物を発送',p=>({pose:'direct',prop:'megaphone',crew:'build',back:R(163,15,170,60,wood,4)+[0,1,2,3,4,5].map(i=>R(171+(i%3)*53,23+Math.floor(i/3)*24,43,17,[sage,coral,paper][i%3],2)).join('')+L('M166 47 h164',wood,3)+R(151,129,194,8,wood,2)+T(176,11,'DISPATCH',paper,7)})),
    V('newsroom','編集部で原稿を仕上げる',p=>({pose:'direct',prop:'pointer',crew:'research',back:board(174,7,161,66)+R(184,17,58,45,ink,2)+L('M251 22 h72 M251 34 h60 M251 45 h67 M251 56 h42',wood,2)+desk(150,132,195)})),
    V('green-team','チームで温室を育てる',p=>({pose:'direct',prop:'remote',crew:'build',back:windowPane(184,5)+L('M168 42 l80 -39 l87 39 M168 42 v87 M335 42 v87',wood,3)+pot(204,72,.6)+pot(259,73,.9)+pot(316,74,.5)+R(151,129,194,8,wood,2)})),
    V('bridge-team','協力して橋を架ける',p=>({pose:'direct',prop:'megaphone',crew:'build',back:L('M155 136 q20 -8 40 0 t40 0 t40 0 t40 0',blue,2)+L('M181 130 v-88 M313 130 v-88 M181 44 Q247 115 313 44 M181 44 h132',wood,3)+[0,1,2,3,4,5].map(i=>L(`M${194+i*21} ${58+Math.sin((i+1)*.45)*18} v47`,paper,1)).join('')+R(170,110,158,6,wood,1)})),
    V('launch-team','みんなで打ち上げ準備',p=>({pose:'direct',prop:'remote',crew:'mission',back:`<path d="M254 14 Q277 27 277 54 V85 H231 V54 Q231 27 254 14Z" fill="${paper}"/>`+C(254,43,10,blue)+`<path d="M231 65 l-15 24 h15 M277 65 l15 24 h-15" fill="${coral}"/>`+R(237,86,34,7,wood,1)+G('m-steam',L('M242 95 v9 M254 95 v12 M266 95 v9',gold,3))+R(151,131,194,6,wood,2)})),
    V('archive-team','図書館をみんなで整理',p=>({pose:'direct',prop:'pointer',crew:'research',back:shelf()+R(151,132,194,5,wood,1)+T(177,12,'SHARED KNOWLEDGE',paper,7)})),
    V('orchestra','指揮者と小さな楽団',p=>({pose:'conduct',prop:'pointer',crew:'music',back:board(180,8,149,61)+[0,1,2].map(i=>L(`M191 ${29+i*8} h126`,ink,1)).join('')+G('m-notes',T(215,45,'♪',ink,20)+T(264,48,'♫',ink,22))+R(151,132,194,5,wood,1)})),
    V('bakery-team','工房で焼き上げる',p=>({pose:'direct',prop:'megaphone',crew:'build',back:R(182,8,145,66,wood,5)+R(190,18,129,45,ink,7)+[0,1,2].map(i=>R(203+i*35,40,26,13,gold,6)).join('')+G('m-steam',L('M218 31 q-5 -7 0 -13 M253 31 q-5 -7 0 -13 M288 31 q-5 -7 0 -13',paper,1))+R(151,132,194,5,wood,1)})),
    V('robot-lab','チームで次のロボットを作る',p=>({pose:'direct',prop:'pointer',crew:'mission',back:board(179,6,154,67)+R(240,18,33,24,p.main,5)+C(250,29,3,ink)+C(263,29,3,ink)+R(242,46,29,17,p.main,4)+L('M237 23 h-39 M278 23 h38 M239 53 h-38 M274 53 h42',ink,1)+R(151,132,194,5,wood,1)})),
  );
  authored.yourturn.push(
    V('party','仲間と完成をお祝い',p=>({pose:'celebrate',companions:'party',back:desk()+R(211,87,60,24,paper,5)+R(215,79,52,10,coral,5)+[0,1,2].map(i=>L(`M${225+i*16} 78 v-10`,paper,2)+G('m-twinkle',C(225+i*16,65,3,gold),`--i:${i}`)).join('')+G('m-confetti',star(184,27,4)+star(288,37,4)+star(321,13,5))})),
    V('stamp','合格のはんこ',p=>({pose:'craft',back:desk()+R(204,57,100,55,paper,2)+G('m-stamp',R(239,36,28,17,wood,3)+R(234,51,38,8,coral,2))+C(255,86,15,'none',`stroke="${coral}" stroke-width="2"`)+L('M246 86 l7 7 l12 -17',coral,3)})),
    V('lanterns','完了の灯りをともす',p=>({pose:'celebrate',prop:'flag',back:windowPane(210,5,true)+L('M157 24 q90 35 177 -6',wood,2)+[0,1,2,3,4].map(i=>G('m-lantern',R(172+i*34,29+Math.sin(i*.9)*8,17,23,[gold,coral,sage][i%3],6)+L(`M${180+i*34} ${26+Math.sin(i*.9)*8} v4`,paper,1),`--i:${i}`)).join('')+pot(328,115,.7)})),
  );
  authored.think.push(
    V('sand-garden','砂の模様を整える',p=>({pose:'ponder',prop:'pointer',back:desk()+R(178,70,144,40,wood,4)+R(184,75,132,29,paper,2)+L('M190 83 q20 -12 40 0 t40 0 t40 0 M190 93 q20 -12 40 0 t40 0 t40 0',wood,1)+E(237,87,13,6,'#73857b')+E(281,88,9,4,'#73857b')})),
    V('puzzle','パズルをつなぐ',p=>({pose:'craft',back:desk()+[0,1,2,3,4].map(i=>R(190+(i%3)*33,67+Math.floor(i/3)*22,30,20,[sage,coral,blue,paper,p.main][i],4)+C(220+(i%3)*33,77+Math.floor(i/3)*22,4,[sage,coral,blue,paper,p.main][i])).join('')+G('m-lift',R(256,43,30,20,gold,4))})),
    V('coffee-ideas','コーヒーとアイデア',p=>({pose:'ponder',back:desk()+R(202,87,28,23,paper,4)+L('M230 91 q15 -2 9 11 h-9',paper,3)+G('m-steam',L('M209 79 q-6 -8 0 -16 M220 78 q-6 -8 0 -16',paper,1))+R(260,68,62,42,wood,3)+R(264,72,54,34,paper,1)+L('M273 81 h35 M273 90 h28 M273 99 h35',ink,1)+pot(321,55,.55)})),
  );
  authored.read.push(
    V('microscope','顕微鏡で細部まで',p=>({pose:'inspect',prop:'magnifier',back:desk()+L('M215 109 h86 M257 103 Q296 81 266 45',blue,9)+L('M248 38 l32 17',wood,13)+L('M249 67 l-10 24',blue,7)+R(221,93,59,4,paper,1)+C(291,72,6,ink)+pot(325,96,.5)})),
    V('scrolls','古い巻物を読み解く',p=>({pose:'read',prop:'magnifier',back:desk()+R(186,35,126,73,paper,3)+R(181,30,13,84,wood,5)+R(304,30,13,84,wood,5)+[0,1,2,3,4,5].map(i=>L(`M204 ${48+i*9} h${80-(i%3)*13}`,ink,1)).join('')+G('m-scan',R(197,45,99,3,p.main,1))})),
    V('pinboard','証拠をボードに結ぶ',p=>({pose:'inspect',prop:'pointer',back:board()+[0,1,2].map(i=>R(195+i*40,30+(i%2)*29,31,30,paper,1)+C(210+i*40,32+(i%2)*29,2,coral)).join('')+L('M210 32 l40 29 l40 -29',coral,1)+T(220,98,'FACT CHECK',ink,8)})),
  );

  function steelColor(){return '#9caaa2';}
  const stateNames={think:'考え中',read:'調べもの',edit:'編集',shell:'コマンド実行',web:'Web調査',browser:'ブラウザ操作',plan:'計画',mcp:'ツール作業',agent:'チーム作業',waiting:'返事・許可待ち',yourturn:'ターン完了',standby:'待機',error:'エラー',stale:'応答なし',interrupted:'中断'};
  const catalogue=Object.entries(stateNames).flatMap(([state,label])=>[{state,id:'original',label:'オリジナル',stateLabel:label,index:0},...authored[state].map((v,i)=>({state,id:v.id,label:v.label,stateLabel:label,index:i+1}))]);
  function hash(s){ let h=2166136261; for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);} return h>>>0; }
  function read(k,fallback){try{return localStorage.getItem('agentdeck.'+k)||fallback;}catch{return fallback;}}
  const settings={theme:read('theme','atelier'),motion:read('motion','full'),look:read('look','auto'),variant:read('variant','auto'),rotation:read('rotation','on'),seed:Number(read('sceneSeed','1'))||1};
  let revision=0;
  function selection(state,seed,options={}){
    const cycle=settings.rotation==='on' && settings.motion!=='paused' && !matchMedia('(prefers-reduced-motion: reduce)').matches ? Math.floor(Date.now()/60000) : 0;
    const h=hash(seed+'|'+state+'|'+settings.seed);
    const variant=Number.isInteger(options.variant)?Math.max(0,Math.min((authored[state]||authored.think).length,options.variant)):settings.variant==='classic'?0:1+((h+cycle)%(authored[state]||authored.think).length);
    const look=Number.isInteger(options.look)?Math.max(0,Math.min(15,options.look)):settings.look==='auto'?1+(hash(seed+'|model|'+settings.seed)%15):Math.max(0,Math.min(15,Number(settings.look)||0));
    return {variant,look,key:`${variant}:${look}:${revision}`};
  }
  function actors(agent,look,kind,count){
    const jobs=kind==='music'?['type','hammer','scan','type','hammer','scan']:kind==='research'?['scan','type','scan','carry','type','scan']:kind==='mission'?['type','scan','type','carry','type','scan']:['carry','hammer','type','scan','carry','hammer'];
    return Array.from({length:Math.min(6,Math.max(0,count))},(_,i)=>{
      const row=i<3?0:1,j=i%3,x=153+j*62+(row?12:0),y=row?54:83,scale=row?.43:.52;
      const job=jobs[i];
      return `<g transform="translate(${x} ${y}) scale(${scale})"><g class="mini job-${job} crew-member" style="--d:${i*.31}s;--i:${i}">${job==='hammer'?R(63,82,31,13,wood,3):''}${Scenes.robot(agent,{mini:true,look:1+((look+i+2)%15),prop:job==='hammer'?'hammer':job==='scan'?'magnifier':null,laptop:job==='type',box:job==='carry'})}${G('m-task-dot',C(81,12,4,sage))}</g></g>`;
    }).reverse().join('');
  }
  function companions(agent,look,kind){
    const poses=kind==='ball'?'catch':kind==='chess'?'chess':kind==='hide'?'hide':['music','party'].includes(kind)?'music':['garden','paint','cook','blocks'].includes(kind)?'craft':['book','stars','fish'].includes(kind)?'rest':'catch';
    const prop=['garden','paint','cook','kite'].includes(kind)?'pointer':kind==='stars'?'remote':null;
    const seated=['fish','chess','book','picnic'].includes(kind);
    return `<g transform="translate(${kind==='hide'?210:kind==='chess'?278:276} ${seated?73:69}) scale(.68)"><g class="companion companion-${poses}">${Scenes.robot(agent,{mini:true,look:1+(look+5)%15,prop,laptop:kind==='music'})}</g></g>`;
  }
  function build(agent,state,o={}){
    if(!stateNames[state]) state='think';
    agent=agent==='codex'?'codex':'claude';
    const pick=selection(state,o.seed||agent,o);
    if(pick.variant===0) return oldBuild(agent,state,{...o,look:pick.look});
    const def=authored[state][pick.variant-1],p=Scenes.PALETTE[agent],d=def.build(p);
    const active=Number.isFinite(o.minis)?Math.max(0,Math.trunc(o.minis)):null;
    const crew=state==='agent'?actors(agent,pick.look,d.crew,active||0):'';
    const play=d.companions?companions(agent,pick.look,d.companions):'';
    const role=state==='agent'?(active===null?'チーム作業 · 人数未取得':`実働 ${active}体${active>6?' · 代表6体を表示':''}`):d.companions?'待機中の仲間 · 演出':'';
    return `<svg class="scene atelier-scene pose-${d.pose||'ponder'}" data-scene="${state}" data-variant="${def.id}" data-look="${pick.look}" viewBox="0 0 360 150" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <path d="M12 138 H348" stroke="#8b9b8240" stroke-width="1"/>
      ${d.back}${play}<g transform="translate(22 40) scale(1.03)"><g class="main">${Scenes.robot(agent,{look:pick.look,prop:d.prop,laptop:d.laptop})}</g></g>
      ${crew}${d.fore||''}${role?T(145,148,role,'#abb7a5',6.5):''}
      ${state==='agent'?G('m-orders',L('M119 71 q14 -10 23 -2 M121 80 q18 -10 28 -1',gold,2)):''}
    </svg>`;
  }
  function configure(next){
    const allowed={theme:['atelier','paper','midnight','original'],motion:['full','calm','paused'],look:['auto',...Array.from({length:16},(_,i)=>String(i))],variant:['auto','classic'],rotation:['on','off']};
    for(const [k,v] of Object.entries(next)){
      if(k==='seed'&&Number.isFinite(v)){settings.seed=Math.trunc(v);try{localStorage.setItem('agentdeck.sceneSeed',String(settings.seed));}catch{}}
      else if(allowed[k]&&allowed[k].includes(String(v))){settings[k]=String(v);try{localStorage.setItem('agentdeck.'+k,String(v));}catch{}}
    }
    revision++;
    document.body.dataset.appearance=settings.theme;
    document.body.dataset.motion=settings.motion;
    document.dispatchEvent(new CustomEvent('deck:appearance',{detail:{...settings}}));
  }
  Scenes.buildScene=build;
  window.MotionScenes={catalogue,stateNames,settings,selection,configure,hash,actors};
  configure({});
})();
