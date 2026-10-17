// ロボットと場面 (SVG) の組み立て。見た目の動きは index.html の CSS が担当する。
'use strict';
(function () {
  const PALETTE = {
    claude: { main: '#ff8a4c', dark: '#b8582a', light: '#ffc29a', mini: '#ffb26b', miniDark: '#c9733a' },
    codex: { main: '#33e1c9', dark: '#1d9c8a', light: '#a8fff1', mini: '#7dffea', miniDark: '#29a894' },
  };
  let uid = 0;

  // 手に持つ道具 (右腕の座標系: 手は 73.5,74 付近、腕は下向き)
  const PROPS = {
    hammer: '<rect x="72" y="72" width="3.2" height="22" rx="1.5" fill="#a8743f"/><rect x="64" y="90" width="19" height="9" rx="2.5" fill="#aab3d6"/><rect x="64" y="90" width="19" height="3" rx="1.5" fill="#dfe5ff"/>',
    magnifier: '<rect x="72.3" y="74" width="3.2" height="11" rx="1.5" fill="#6b4a2b"/><circle cx="74" cy="92" r="8" fill="rgba(170,225,255,.35)" stroke="#e3ecff" stroke-width="2.6"/><path d="M70 89 q2 -3 5 -2" stroke="#fff" stroke-width="1.4" fill="none" opacity=".8"/>',
    pointer: '<line x1="73.5" y1="74" x2="73.5" y2="108" stroke="#e9ecff" stroke-width="2.4" stroke-linecap="round"/><circle cx="73.5" cy="108" r="2.6" fill="#ff4d6d"/>',
    megaphone: '<path d="M70 76 L77 76 L86 98 L61 98 Z" fill="#ffd166" stroke="#c99a2e" stroke-width="1.2"/><ellipse cx="73.5" cy="98" rx="12.5" ry="3" fill="#e0b041"/>',
    remote: '<rect x="69.5" y="73" width="8" height="13" rx="2.5" fill="#2a3050" stroke="#5a64a0"/><circle cx="73.5" cy="77" r="1.6" fill="#ff4d6d" class="led"/>',
    wrench: '<path d="M72.3 74 h3 v16 h-3z" fill="#aab3d6"/><path d="M68 89 a6 6 0 1 0 11 0 l-3 3 h-5z" fill="#aab3d6"/>',
    flag: '<line x1="73.5" y1="70" x2="73.5" y2="104" stroke="#e9ecff" stroke-width="2"/><path d="M74 100 l18 -4 l-18 -5z" fill="#4ade80" class="flag-cloth"/>',
  };

  // agent: claude|codex, o: {prop, laptop, box, mini}
  function robot(agent, o = {}) {
    agent = agent === "codex" ? "codex" : "claude";
    if (window.MotionActors && Number(o.look) > 0) return MotionActors.render(agent, o, PROPS, PALETTE);
    const P = PALETTE[agent];
    const main = o.mini ? P.mini : P.main, dark = o.mini ? P.miniDark : P.dark;
    const head = agent === 'claude'
      ? `<rect x="26" y="15" width="48" height="37" rx="18" fill="${main}"/>
         <rect x="32" y="22" width="36" height="23" rx="11" fill="#1b1530"/>
         <circle cx="29" cy="42" r="3" fill="#ffb3a0" opacity=".7"/><circle cx="71" cy="42" r="3" fill="#ffb3a0" opacity=".7"/>
         <line x1="50" y1="15" x2="50" y2="6" stroke="${dark}" stroke-width="2.5"/>
         <polygon class="ant-tip" points="50,0 52,4 56,5 52,6.5 50,11 48,6.5 44,5 48,4" fill="#fff2b0"/>`
      : `<rect x="25" y="16" width="50" height="35" rx="7" fill="${main}"/>
         <rect x="20" y="27" width="5" height="12" rx="2" fill="${dark}"/><rect x="75" y="27" width="5" height="12" rx="2" fill="${dark}"/>
         <rect x="31" y="22" width="38" height="23" rx="4" fill="#0b1d24"/>
         <line x1="50" y1="16" x2="50" y2="8" stroke="${dark}" stroke-width="2.5"/>
         <circle class="ant-tip" cx="50" cy="6" r="3.5" fill="#b9fff4"/>`;
    const eyes = agent === 'claude'
      ? `<ellipse cx="43" cy="33" rx="3.4" ry="4.4" fill="#fff"/><ellipse cx="57" cy="33" rx="3.4" ry="4.4" fill="#fff"/>
         <path class="mouth" d="M46 39 Q50 42 54 39" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
      : `<rect x="38" y="28" width="6" height="9" rx="1.5" fill="#7dffea"/><rect x="56" y="28" width="6" height="9" rx="1.5" fill="#7dffea"/>
         <rect class="mouth" x="46" y="39.5" width="8" height="1.8" rx=".9" fill="#7dffea"/>`;
    const prop = o.prop && PROPS[o.prop] ? `<g class="prop prop-${o.prop}">${PROPS[o.prop]}</g>` : '';
    const box = o.box ? `<g class="carry-box"><rect x="30" y="58" width="40" height="26" rx="3" fill="#d9a066" stroke="#9c6b3c" stroke-width="1.5"/><path d="M30 67 h40 M50 58 v26" stroke="#9c6b3c" stroke-width="1.2"/></g>` : '';
    const laptop = o.laptop ? `<g class="laptop"><rect x="30" y="62" width="40" height="18" rx="3" fill="#2a3050" stroke="#4a5280" stroke-width="1"/>
        <circle class="screen-glow" cx="50" cy="71" r="3.5" fill="${main}"/><rect x="24" y="80" width="52" height="4" rx="2" fill="#9aa3cc"/></g>` : '';
    return `<g class="bot">
      <ellipse class="shadow" cx="50" cy="94" rx="22" ry="4" fill="#000" opacity=".4"/>
      <g class="body-grp">
        <rect class="leg-l" x="39" y="74" width="8" height="16" rx="4" fill="${dark}"/>
        <rect class="leg-r" x="53" y="74" width="8" height="16" rx="4" fill="${dark}"/>
        <g class="arm-l"><rect x="22" y="52" width="9" height="21" rx="4.5" fill="${dark}"/><circle cx="26.5" cy="74" r="4.5" fill="${main}"/></g>
        <rect x="31" y="49" width="38" height="29" rx="10" fill="${main}"/>
        <rect x="40" y="56" width="20" height="12" rx="3" fill="#1b1530" opacity=".6"/>
        <circle class="chest" cx="50" cy="62" r="3" fill="#fff"/>
        <g class="head">${head}
          <g class="eyes-pos"><g class="eyes">${eyes}</g></g>
          <g class="xeyes" stroke="#ff4d6d" stroke-width="2.4" stroke-linecap="round"><path d="M40 30 l6 6 M46 30 l-6 6 M54 30 l6 6 M60 30 l-6 6"/></g>
          <path class="sweat" d="M74 20 q3 5 0 7 q-3 -2 0 -7z" fill="#8fd3ff"/>
        </g>
        ${laptop}
        <g class="arm-r"><rect x="69" y="52" width="9" height="21" rx="4.5" fill="${dark}"/><circle cx="73.5" cy="74" r="4.5" fill="${main}"/>${prop}</g>
        ${box}
      </g>
    </g>`;
  }

  const gear = (cx, cy, r, color, cls) => {
    let teeth = '';
    for (let i = 0; i < 8; i++) teeth += `<rect x="${cx - r * .22}" y="${cy - r * 1.28}" width="${r * .44}" height="${r * .5}" rx="1" fill="${color}" transform="rotate(${i * 45} ${cx} ${cy})"/>`;
    return `<g class="${cls}">${teeth}<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/><circle cx="${cx}" cy="${cy}" r="${r * .4}" fill="#141a33"/></g>`;
  };

  // 場面ごとの背景・小道具とロボットの持ち物
  const SCENES = {
    think(P) {
      return {
        prop: null,
        back: `<g class="s-think">
          <circle cx="132" cy="44" r="4" fill="#e9ecff" opacity=".7"/><circle cx="144" cy="34" r="6" fill="#e9ecff" opacity=".8"/>
          <g class="cloud"><ellipse cx="205" cy="40" rx="52" ry="30" fill="#e9ecff"/><ellipse cx="170" cy="46" rx="26" ry="20" fill="#e9ecff"/><ellipse cx="240" cy="48" rx="28" ry="20" fill="#e9ecff"/><ellipse cx="205" cy="18" rx="30" ry="16" fill="#e9ecff"/>
          ${gear(188, 40, 11, '#7a86c8', 'g1')}${gear(214, 33, 7, '#ff8a4c', 'g2')}${gear(226, 50, 6, '#33e1c9', 'g3')}
          <g class="bulb"><circle cx="248" cy="26" r="7" fill="#ffd166"/><rect x="245" y="32" width="6" height="5" rx="1" fill="#aab3d6"/></g></g>
          <text class="qmark" x="300" y="70" font-size="30" font-weight="900" fill="${P.light}">?</text></g>`,
      };
    },
    read(P) {
      const lines = n => Array.from({ length: n }, (_, i) => `<rect x="${210}" y="${38 + i * 11}" width="${70 - (i % 3) * 14}" height="4" rx="2" fill="#7a86c8"/>`).join('');
      return {
        prop: 'magnifier',
        back: `<g class="s-read">
          <rect x="196" y="30" width="110" height="98" rx="5" fill="#3a4370"/><rect x="190" y="24" width="110" height="98" rx="5" fill="#4a5590"/>
          <rect x="184" y="18" width="110" height="98" rx="5" fill="#e9ecff"/>${lines(7)}
          <rect class="scanline" x="186" y="22" width="106" height="8" fill="${P.main}" opacity=".35"/>
          <g class="page"><rect x="239" y="18" width="55" height="98" rx="4" fill="#cfd6ff"/></g>
          <g class="books"><rect x="312" y="74" width="12" height="54" rx="2" fill="#ff8a4c"/><rect x="326" y="66" width="12" height="62" rx="2" fill="#33e1c9"/><rect x="340" y="80" width="10" height="48" rx="2" fill="#b388ff"/></g></g>`,
      };
    },
    edit(P) {
      const code = Array.from({ length: 7 }, (_, i) => `<rect class="code c${i}" x="${232 + (i % 3) * 8}" y="${32 + i * 12}" width="${80 - (i % 4) * 12}" height="5" rx="2.5" fill="${['#ff8a4c', '#33e1c9', '#b388ff', '#ffd166'][i % 4]}"/>`).join('');
      return {
        prop: 'hammer',
        back: `<g class="s-edit">
          <rect x="222" y="16" width="124" height="112" rx="8" fill="#141a33" stroke="#3a4370"/>${code}
          <g class="anvil"><rect x="150" y="104" width="46" height="24" rx="4" fill="#3a4370"/><text x="173" y="121" text-anchor="middle" font-size="12" font-weight="800" fill="#cfd6ff" font-family="Orbitron,monospace">&lt;/&gt;</text></g>
          <g class="sparks" stroke="#ffd166" stroke-width="2.4" stroke-linecap="round"><path d="M156 100 l-8 -8 M162 98 l0 -11 M168 100 l8 -8 M152 104 l-10 -1"/></g></g>`,
      };
    },
    shell(P) {
      const rows = Array.from({ length: 6 }, (_, i) => `<g class="tl t${i}"><text x="182" y="${42 + i * 14}" font-size="10" font-family="ui-monospace,monospace" fill="${P.light}">$</text><rect x="192" y="${35 + i * 14}" width="${40 + ((i * 37) % 90)}" height="6" rx="3" fill="${i % 2 ? '#7a86c8' : P.main}"/></g>`).join('');
      return {
        prop: null, laptop: true,
        back: `<g class="s-shell">
          <rect x="170" y="12" width="178" height="116" rx="9" fill="#0b1020" stroke="#3a4370" stroke-width="1.5"/>
          <rect x="170" y="12" width="178" height="16" rx="9" fill="#1b2140"/><circle cx="181" cy="20" r="3" fill="#ff5f57"/><circle cx="191" cy="20" r="3" fill="#febc2e"/><circle cx="201" cy="20" r="3" fill="#28c840"/>
          <g class="tlines">${rows}</g><rect class="cursor" x="192" y="117" width="7" height="8" fill="${P.light}"/></g>`,
      };
    },
    web(P) {
      const id = `gc${++uid}`;
      return {
        prop: 'remote',
        back: `<g class="s-web">
          <defs><clipPath id="${id}"><circle cx="268" cy="74" r="46"/></clipPath></defs>
          <circle cx="268" cy="74" r="52" fill="${P.main}" opacity=".12" class="halo2"/>
          <circle cx="268" cy="74" r="46" fill="#1d4f8f"/>
          <g clip-path="url(#${id})"><g class="land">
            <path d="M200 60 q15 -18 32 -6 q8 14 -6 22 q-18 4 -26 -16z M250 92 q18 -10 30 4 q-4 18 -24 14z M300 50 q14 -8 24 6 q-6 14 -20 8z" fill="#4ade80" opacity=".85"/>
            <path d="M292 60 q15 -18 32 -6 q8 14 -6 22 q-18 4 -26 -16z M342 92 q18 -10 30 4 q-4 18 -24 14z M392 50 q14 -8 24 6 q-6 14 -20 8z" fill="#4ade80" opacity=".85"/></g>
            <ellipse cx="268" cy="74" rx="46" ry="14" fill="none" stroke="#9cc8ff" stroke-width="1" opacity=".5"/><ellipse cx="268" cy="74" rx="18" ry="46" fill="none" stroke="#9cc8ff" stroke-width="1" opacity=".5"/></g>
          <ellipse cx="268" cy="74" rx="70" ry="20" fill="none" stroke="${P.light}" stroke-width="1" stroke-dasharray="3 5" opacity=".6" transform="rotate(-18 268 74)"/>
          <g><rect x="-5" y="-3" width="10" height="6" rx="1" fill="#e9ecff"/><rect x="-11" y="-2" width="5" height="4" fill="#6aa8ff"/><rect x="6" y="-2" width="5" height="4" fill="#6aa8ff"/>
            <animateMotion dur="5s" repeatCount="indefinite" path="M338 52 A70 20 -18 1 1 198 96 A70 20 -18 1 1 338 52"/></g>
          <g class="waves" stroke="${P.light}" stroke-width="2.2" fill="none" stroke-linecap="round"><path class="w1" d="M100 24 q8 8 0 16"/><path class="w2" d="M108 18 q13 14 0 28"/><path class="w3" d="M116 12 q18 20 0 40"/></g>
          <g class="packet"><circle r="3.5" fill="#ffd166"><animateMotion dur="1.6s" repeatCount="indefinite" path="M120 30 Q180 -10 230 46"/></circle></g></g>`,
      };
    },
    browser(P) {
      return {
        prop: 'remote',
        back: `<g class="s-browser">
          <rect x="176" y="12" width="172" height="116" rx="9" fill="#e9ecff"/>
          <rect x="176" y="12" width="172" height="22" rx="9" fill="#cfd6ff"/><rect x="184" y="17" width="44" height="12" rx="4" fill="#fff"/><rect x="232" y="17" width="34" height="12" rx="4" fill="#b9c2ec"/>
          <rect x="184" y="38" width="156" height="12" rx="6" fill="#fff" stroke="#b9c2ec"/><rect class="url" x="190" y="42" width="90" height="4" rx="2" fill="#7a86c8"/>
          <rect x="184" y="56" width="70" height="46" rx="5" fill="${P.light}"/><circle cx="204" cy="72" r="7" fill="#fff" opacity=".8"/><path d="M188 98 l18 -16 l12 10 l10 -8 l22 14z" fill="${P.main}" opacity=".8"/>
          <rect x="262" y="58" width="76" height="6" rx="3" fill="#7a86c8"/><rect x="262" y="70" width="60" height="6" rx="3" fill="#b9c2ec"/><rect x="262" y="82" width="68" height="6" rx="3" fill="#b9c2ec"/>
          <rect class="btn-target" x="262" y="96" width="44" height="14" rx="7" fill="${P.main}"/>
          <g class="cursor-arrow"><path d="M0 0 l0 16 l4.5 -4 l3.5 7.5 l3 -1.5 l-3.5 -7 l6 -.5z" fill="#141a33" stroke="#fff" stroke-width="1.2"/></g>
          <circle class="click-ripple" cx="284" cy="103" r="4" fill="none" stroke="${P.main}" stroke-width="2"/></g>`,
      };
    },
    plan(P) {
      const rows = [0, 1, 2, 3].map(i => `<rect x="214" y="${34 + i * 21}" width="12" height="12" rx="3" fill="none" stroke="#7a86c8" stroke-width="2"/>
        <rect x="234" y="${38 + i * 21}" width="${84 - i * 10}" height="5" rx="2.5" fill="#7a86c8"/>
        <path class="chk k${i}" d="M216 ${40 + i * 21} l4 4 l7 -9" stroke="#4ade80" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
      return {
        prop: 'pointer',
        back: `<g class="s-plan">
          <line x1="214" y1="122" x2="206" y2="138" stroke="#7a86c8" stroke-width="3"/><line x1="320" y1="122" x2="328" y2="138" stroke="#7a86c8" stroke-width="3"/>
          <rect x="198" y="14" width="140" height="110" rx="8" fill="#e9ecff" stroke="#aab3d6" stroke-width="3"/>
          <text x="214" y="28" font-size="9" font-weight="900" fill="#4a5590">TODO</text>${rows}</g>`,
      };
    },
    mcp(P) {
      const boxes = [0, 1, 2].map(i => `<g class="cbox b${i}"><rect x="150" y="100" width="18" height="16" rx="2" fill="#d9a066" stroke="#9c6b3c"/></g>`).join('');
      return {
        prop: 'wrench',
        back: `<g class="s-mcp">
          <rect x="268" y="36" width="80" height="92" rx="8" fill="#3a4370" stroke="#5a64a0" stroke-width="2"/>
          <rect x="276" y="44" width="64" height="30" rx="4" fill="#141a33"/>${gear(296, 59, 9, P.main, 'g1')}${gear(320, 59, 6, '#ffd166', 'g2')}
          <circle class="lamp l1" cx="282" cy="86" r="4" fill="#4ade80"/><circle class="lamp l2" cx="296" cy="86" r="4" fill="#ffd166"/><circle class="lamp l3" cx="310" cy="86" r="4" fill="#ff4d6d"/>
          <rect x="262" y="100" width="10" height="20" fill="#141a33"/>
          <rect x="146" y="116" width="124" height="8" rx="4" fill="#5a64a0"/>
          <g class="rollers" fill="#aab3d6">${[0, 1, 2, 3, 4, 5].map(i => `<circle cx="${154 + i * 22}" cy="120" r="3"/>`).join('')}</g>
          ${boxes}<g class="steam" fill="#cfd6ff"><circle cx="330" cy="30" r="5"/><circle cx="338" cy="22" r="4"/></g></g>`,
      };
    },
    agent(P) {
      return {
        prop: 'megaphone',
        back: `<g class="s-agent">
          <rect x="150" y="96" width="206" height="42" rx="8" fill="#1b2140" opacity=".55"/><rect x="170" y="64" width="186" height="34" rx="8" fill="#1b2140" opacity=".3"/>
          <g class="callout"><path d="M136 70 q10 -10 0 -20 M142 76 q18 -16 0 -32" stroke="#ffd166" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>
          <g class="orders">
            <g class="o1"><rect x="96" y="2" width="70" height="20" rx="10" fill="#fff"/><text x="131" y="16" text-anchor="middle" font-size="10" font-weight="900" fill="#1b1530">それ頼む！</text></g>
            <g class="o2"><rect x="96" y="2" width="70" height="20" rx="10" fill="#fff"/><text x="131" y="16" text-anchor="middle" font-size="10" font-weight="900" fill="#1b1530">がんばれ〜</text></g>
            <g class="o3"><rect x="96" y="2" width="70" height="20" rx="10" fill="#fff"/><text x="131" y="16" text-anchor="middle" font-size="10" font-weight="900" fill="#1b1530">いいね！</text></g>
          </g></g>`,
      };
    },
    waiting(P, o) {
      const msg = o.permission ? '許可して！' : '返事まって！';
      return {
        prop: null,
        back: `<g class="s-waiting">
          <g class="sign"><rect x="268" y="60" width="8" height="78" fill="#7a86c8"/>
            <rect x="196" y="18" width="152" height="50" rx="10" fill="#ffc531" stroke="#fff3c4" stroke-width="3"/>
            <text x="272" y="51" text-anchor="middle" font-size="20" font-weight="900" fill="#2a1c00">${msg}</text>
            <circle class="beacon" cx="272" cy="12" r="6" fill="#ff4d6d"/></g>
          <g class="alert-bang"><circle cx="122" cy="20" r="14" fill="#ffc531"/><text x="122" y="27" text-anchor="middle" font-size="20" font-weight="900" fill="#2a1c00">!</text></g></g>`,
      };
    },
    yourturn(P) {
      return {
        prop: 'flag',
        back: `<g class="s-yourturn">
          <g class="trophy"><path d="M246 40 h44 v14 q0 26 -22 30 q-22 -4 -22 -30z" fill="#ffd166" stroke="#c99a2e" stroke-width="2"/>
            <path d="M246 46 q-14 0 -12 12 q2 10 14 10 M290 46 q14 0 12 12 q-2 10 -14 10" fill="none" stroke="#ffd166" stroke-width="4"/>
            <rect x="262" y="84" width="12" height="16" fill="#c99a2e"/><rect x="248" y="100" width="40" height="10" rx="3" fill="#7a5a1e"/>
            <text x="268" y="66" text-anchor="middle" font-size="16" font-weight="900" fill="#7a5a1e">✓</text></g>
          <g class="twinkles" fill="#fff">${[[230, 30], [310, 40], [300, 92], [224, 86], [276, 22]].map(([x, y], i) => `<path class="tw tw${i}" d="M${x} ${y - 6} L${x + 1.6} ${y - 1.6} L${x + 6} ${y} L${x + 1.6} ${y + 1.6} L${x} ${y + 6} L${x - 1.6} ${y + 1.6} L${x - 6} ${y} L${x - 1.6} ${y - 1.6}z"/>`).join('')}</g>
          <g class="okb"><rect x="104" y="0" width="54" height="22" rx="11" fill="#fff"/><path d="M114 21 l-5 7 l11 -7z" fill="#fff"/>
            <text x="131" y="15.5" text-anchor="middle" font-size="11" font-weight="900" fill="#1b1530">できた！</text></g></g>`,
      };
    },
    standby(P) {
      return {
        prop: null,
        back: `<g class="s-standby">
          <path d="M318 14 a20 20 0 1 0 18 28 a16 16 0 1 1 -18 -28z" fill="#ffe9a8"/>
          <g class="stars" fill="#e9ecff">${[[200, 22], [240, 40], [286, 18], [350, 70], [220, 70], [300, 60]].map(([x, y], i) => `<circle class="st st${i}" cx="${x}" cy="${y}" r="${1.4 + (i % 3) * .6}"/>`).join('')}</g>
          <g class="zzz" font-weight="900" fill="#b9c4ff"><text x="112" y="34" font-size="12">z</text><text x="120" y="24" font-size="15">Z</text><text x="110" y="14" font-size="10">z</text></g>
          <g class="lamp-post"><rect x="252" y="60" width="4" height="78" fill="#3a4370"/><path d="M244 60 h20 l-4 -10 h-12z" fill="#5a64a0"/></g></g>`,
      };
    },
    error(P) {
      return {
        prop: null,
        back: `<g class="s-error">
          <g class="warn"><path d="M272 18 L318 100 L226 100 Z" fill="#ffc531" stroke="#2a1c00" stroke-width="3" stroke-linejoin="round"/>
            <text x="272" y="88" text-anchor="middle" font-size="44" font-weight="900" fill="#2a1c00">!</text></g>
          <g class="smoke" fill="#9aa0b8"><circle cx="64" cy="26" r="6"/><circle cx="78" cy="20" r="7"/><circle cx="90" cy="28" r="5"/></g>
          <g class="zap" stroke="#ffd166" stroke-width="2.5" fill="none" stroke-linecap="round"><path d="M140 60 l8 6 l-6 4 l9 7"/><path d="M30 70 l-8 5 l6 4 l-9 6"/></g></g>`,
      };
    },
    interrupted(P) {
      return {
        prop: null,
        back: `<g class="s-interrupted">
          <g class="stop"><rect x="268" y="70" width="6" height="68" fill="#7a86c8"/>
            <path d="M256 18 h30 l20 20 v30 l-20 20 h-30 l-20 -20 v-30z" fill="#ff4d6d" stroke="#fff" stroke-width="3"/>
            <text x="271" y="60" text-anchor="middle" font-size="17" font-weight="900" fill="#fff">中断</text></g></g>`,
      };
    },
  };
  SCENES.stale = SCENES.error;

  const JOBS = ['carry', 'hammer', 'type', 'scan', 'carry', 'hammer'];
  const SLOTS = [
    { x: 146, y: 84, s: .54 }, { x: 214, y: 84, s: .54 }, { x: 282, y: 84, s: .54 },
    { x: 178, y: 56, s: .44 }, { x: 236, y: 56, s: .44 }, { x: 294, y: 56, s: .44 },
  ];

  function minis(agent, n, look = 0) {
    let out = '';
    for (let i = Math.min(n, 6) - 1; i >= 0; i--) {
      const job = JOBS[i], sl = SLOTS[i];
      const tools = job === 'hammer' ? `<g class="mini-anvil"><rect x="64" y="80" width="30" height="14" rx="3" fill="#3a4370"/></g><g class="mini-spark" stroke="#ffd166" stroke-width="3" stroke-linecap="round"><path d="M70 76 l-6 -7 M78 74 v-9 M86 76 l6 -7"/></g>` : '';
      const note = `<text class="mini-emote" x="62" y="4" font-size="16">${['♪', '💦', '✨', '💪', '♪', '🔨'][i]}</text>`;
      out += `<g transform="translate(${sl.x} ${sl.y}) scale(${sl.s})"><g class="mini job-${job}" style="--d:${(i * .37).toFixed(2)}s">${tools}
        ${robot(agent, { mini: true, look: look ? 1 + ((look + i + 2) % 15) : 0, prop: job === 'hammer' ? 'hammer' : job === 'scan' ? 'magnifier' : null, laptop: job === 'type', box: job === 'carry' })}${note}</g></g>`;
    }
    return out;
  }

  // scene: think|read|edit|shell|web|browser|plan|mcp|agent|waiting|yourturn|standby|error|stale|interrupted
  function buildScene(agent, scene, o = {}) {
    agent = agent === "codex" ? "codex" : "claude";
    const P = PALETTE[agent];
    const def = (SCENES[scene] || SCENES.think)(P, o);
    const crew = scene === 'agent' ? minis(agent, Number.isFinite(o.minis) ? Math.max(0, o.minis) : 0, o.look) : '';
    return `<svg class="scene" data-scene="${scene}" viewBox="0 0 360 150" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <rect class="floor" x="0" y="134" width="360" height="16" fill="url(#floorGrad)"/>
      ${def.back}
      <g transform="translate(22 26) scale(1.14)"><g class="main">${robot(agent, { prop: def.prop, laptop: def.laptop, look: o.look })}</g></g>
      ${crew}
    </svg>`;
  }

  // 終了済みカード用の小さなロボット
  function tinyBot(agent) {
    return `<svg class="tiny" viewBox="0 0 100 100" aria-hidden="true">${robot(agent, {})}</svg>`;
  }

  window.Scenes = { buildScene, tinyBot, robot, PALETTE };
})();
