"use strict";
/*
몬스터/보스 SVG 생성 함수.
순수 함수(전역 상태 미참조). 의존성 없음.
export(전역): heroBossSvg, svgMonster
주의: 'goldgoblin'(황금고블린 — 외상 도박사의 빚쟁이 이벤트 전용 몬스터,
     combat/battle-setup.js의 GOLDEN_GOBLIN 참고) 케이스를 추가했다. 원래
     default 폴백(빈 원)으로도 에러 없이 동작은 했지만, "화려한 금색 정장,
     금니, 손에 장부"라는 컨셉에 맞는 전용 비주얼을 새로 그렸다 — 기존 goblin
     실루엣을 베이스로 금색 정장 상의와 장부를 추가한 형태.
*/

  /* ============ 몬스터 SVG 생성 ============ */
  // 최종보스: 6개 직업 중 하나의 모습을 한 "타락한 용사" 공용 실루엣.
  // 색상(pal)과 무기/장신구 실루엣(weaponSvg)만 직업별로 바뀐다.
  function heroBossSvg(pal, weaponSvg){
    const glow = `<filter id="eg2"><feGaussianBlur stdDeviation="1.4"/></filter>`;
    return `<svg viewBox="0 0 140 140">${glow}
      <ellipse cx="70" cy="120" rx="42" ry="10" fill="#000" opacity="0.35"/>
      ${weaponSvg}
      <path d="M70 18 C48 18 36 40 40 62 C36 66 36 82 48 90 L92 90 C104 82 104 66 100 62 C104 40 92 18 70 18 Z" fill="${pal.c1}"/>
      <path d="M70 18 C58 18 50 28 48 40 L92 40 C90 28 82 18 70 18 Z" fill="${pal.accent}" opacity="0.55"/>
      <ellipse cx="58" cy="54" rx="6" ry="7" fill="${pal.eye}" filter="url(#eg2)"/>
      <ellipse cx="82" cy="54" rx="6" ry="7" fill="${pal.eye}" filter="url(#eg2)"/>
      <circle cx="58" cy="55" r="2.4" fill="#fff"/><circle cx="82" cy="55" r="2.4" fill="#fff"/>
      <path d="M40 92 Q70 82 100 92 L106 128 Q70 140 34 128 Z" fill="${pal.c2}"/>
      <path d="M40 92 Q70 82 100 92 L96 104 Q70 96 44 104 Z" fill="${pal.accent}"/>
      <path d="M52 90 L52 128 M70 92 L70 132 M88 90 L88 128" stroke="#000" stroke-opacity="0.25" stroke-width="2"/>
    </svg>`;
  }

  // ---------- 실사(픽셀아트) PNG 몬스터 이미지 ----------
  // 사용자가 직접 그린 픽셀아트 이미지를 SVG 대신 쓰고 싶은 몬스터를 여기 등록한다.
  // 등록된 type이면 svgMonster()가 SVG 대신 <img> 태그를 반환한다 — 호출부
  // (combat/battle-setup.js의 startBattle() 등)는 전혀 손댈 필요가 없다, 이
  // 함수 하나만 고치면 끝. 새 몬스터 이미지를 추가할 때도 이 객체에 한 줄만
  // 추가하면 된다.
  const MONSTER_IMG = {
    /*wolf: 'images/monsters/wolf.png',
    skeleton: 'images/monsters/skeleton.png',
    slime: 'images/monsters/slime.png',
    bandit: 'images/monsters/bandit.png',
    bat: 'images/monsters/bat.png',
    goblin: 'images/monsters/goblin.png',*/
    spider: 'images/monsters/spider.png',
  };

  function svgMonster(type){
    if(MONSTER_IMG[type]){
      return `<img src="${MONSTER_IMG[type]}" alt="${type}" style="width:100%; height:100%; object-fit:contain;">`;
    }
    const glow = `<filter id="eg"><feGaussianBlur stdDeviation="1.4"/></filter>`;
    switch(type){
      case 'slime': return `<svg viewBox="0 0 120 120">${glow}
        <ellipse cx="60" cy="82" rx="42" ry="30" fill="#4a7350"/>
        <ellipse cx="60" cy="78" rx="42" ry="26" fill="#6fae76"/>
        <ellipse cx="42" cy="60" rx="8" ry="10" fill="#1a130c" filter="url(#eg)"/>
        <ellipse cx="78" cy="60" rx="8" ry="10" fill="#1a130c" filter="url(#eg)"/>
        <ellipse cx="42" cy="58" rx="8" ry="10" fill="#e6c34a"/>
        <ellipse cx="78" cy="58" rx="8" ry="10" fill="#e6c34a"/>
        <circle cx="42" cy="58" r="3" fill="#1a130c"/><circle cx="78" cy="58" r="3" fill="#1a130c"/>
        <ellipse cx="50" cy="90" rx="10" ry="4" fill="#3a5c40" opacity="0.5"/>
      </svg>`;
      case 'goblin': return `<svg viewBox="0 0 120 120">${glow}
        <ellipse cx="60" cy="100" rx="28" ry="10" fill="#000" opacity="0.35"/>
        <path d="M60 30 C40 30 30 48 32 68 C34 90 48 100 60 100 C72 100 86 90 88 68 C90 48 80 30 60 30 Z" fill="#5c7a3f"/>
        <path d="M30 40 L18 20 L36 34 Z" fill="#5c7a3f"/><path d="M90 40 L102 20 L84 34 Z" fill="#5c7a3f"/>
        <ellipse cx="48" cy="62" rx="6" ry="7" fill="#e6c34a"/><ellipse cx="72" cy="62" rx="6" ry="7" fill="#e6c34a"/>
        <circle cx="48" cy="63" r="2.4" fill="#1a130c"/><circle cx="72" cy="63" r="2.4" fill="#1a130c"/>
        <path d="M46 82 Q60 92 74 82" stroke="#1a130c" stroke-width="3" fill="none"/>
        <rect x="86" y="55" width="8" height="42" rx="2" fill="#6b5230" transform="rotate(20 86 55)"/>
      </svg>`;
      case 'goldgoblin': return `<svg viewBox="0 0 120 120">${glow}
        <ellipse cx="60" cy="106" rx="34" ry="8" fill="#000" opacity="0.3"/>
        <path d="M60 26 C42 26 32 42 34 58 C28 62 28 76 38 82 L82 82 C92 76 92 62 86 58 C88 42 78 26 60 26 Z" fill="#5c7a3f"/>
        <path d="M32 36 L20 16 L38 30 Z" fill="#5c7a3f"/><path d="M88 36 L100 16 L82 30 Z" fill="#5c7a3f"/>
        <ellipse cx="48" cy="56" rx="6" ry="7" fill="#ffe08a" filter="url(#eg)"/><ellipse cx="72" cy="56" rx="6" ry="7" fill="#ffe08a" filter="url(#eg)"/>
        <circle cx="48" cy="57" r="2.4" fill="#1a130c"/><circle cx="72" cy="57" r="2.4" fill="#1a130c"/>
        <path d="M46 74 Q60 82 74 74" stroke="#1a130c" stroke-width="3" fill="none"/>
        <path d="M50 76 L52 80 L54 76 Z" fill="#fff8e0"/><path d="M66 76 L68 80 L70 76 Z" fill="#fff8e0"/>
        <path d="M40 84 Q60 74 80 84 L86 116 Q60 126 34 116 Z" fill="#c9a227"/>
        <path d="M40 84 Q60 74 80 84 L76 96 Q60 88 44 96 Z" fill="#ffe08a" opacity="0.55"/>
        <path d="M56 86 L59 118 M64 86 L64 120" stroke="#8a6f1a" stroke-width="2" opacity="0.6"/>
        <rect x="84" y="88" width="18" height="24" rx="2" fill="#3a2c1c" transform="rotate(14 84 88)"/>
        <rect x="86" y="91" width="14" height="18" rx="1" fill="#e9dcc0" transform="rotate(14 84 88)"/>
        <line x1="88" y1="97" x2="98" y2="95" stroke="#3a2c1c" stroke-width="1" transform="rotate(14 84 88)"/>
        <line x1="88" y1="101" x2="98" y2="99" stroke="#3a2c1c" stroke-width="1" transform="rotate(14 84 88)"/>
      </svg>`;
      case 'skeleton': return `<svg viewBox="0 0 120 120">${glow}
        <ellipse cx="60" cy="30" rx="20" ry="22" fill="#dccba0"/>
        <circle cx="52" cy="28" r="5" fill="#1a130c"/><circle cx="68" cy="28" r="5" fill="#1a130c"/>
        <path d="M50 40 Q60 46 70 40" stroke="#1a130c" stroke-width="2.5" fill="none"/>
        <rect x="52" y="48" width="16" height="10" fill="#dccba0"/>
        <path d="M40 60 Q60 55 80 60 L78 88 Q60 95 42 88 Z" fill="none" stroke="#dccba0" stroke-width="4"/>
        <line x1="46" y1="64" x2="46" y2="86" stroke="#dccba0" stroke-width="3"/>
        <line x1="56" y1="62" x2="56" y2="88" stroke="#dccba0" stroke-width="3"/>
        <line x1="66" y1="62" x2="66" y2="88" stroke="#dccba0" stroke-width="3"/>
        <line x1="76" y1="64" x2="76" y2="86" stroke="#dccba0" stroke-width="3"/>
        <rect x="28" y="58" width="7" height="40" fill="#8fa0b8" transform="rotate(-8 28 58)"/>
        <rect x="20" y="52" width="20" height="7" fill="#8fa0b8" transform="rotate(-8 20 52)"/>
      </svg>`;
      case 'wolf': return `<svg viewBox="0 0 120 120">${glow}
        <ellipse cx="60" cy="100" rx="30" ry="8" fill="#000" opacity="0.3"/>
        <path d="M60 34 C36 34 26 56 30 76 C33 92 48 100 60 100 C72 100 87 92 90 76 C94 56 84 34 60 34 Z" fill="#241d17"/>
        <path d="M32 44 L20 18 L42 38 Z" fill="#241d17"/><path d="M88 44 L100 18 L78 38 Z" fill="#241d17"/>
        <path d="M60 60 L48 88 L72 88 Z" fill="#1a1510"/>
        <ellipse cx="46" cy="58" rx="6" ry="6" fill="#d1543c" filter="url(#eg)"/><ellipse cx="74" cy="58" rx="6" ry="6" fill="#d1543c" filter="url(#eg)"/>
        <circle cx="46" cy="58" r="2.6" fill="#fff2c0"/><circle cx="74" cy="58" r="2.6" fill="#fff2c0"/>
      </svg>`;
      case 'bandit': return `<svg viewBox="0 0 120 120">${glow}
        <path d="M60 26 C40 26 34 44 36 58 C30 62 30 78 40 84 L80 84 C90 78 90 62 84 58 C86 44 80 26 60 26 Z" fill="#3a2c4a"/>
        <path d="M38 56 Q60 46 82 56 L80 62 Q60 54 40 62 Z" fill="#241a30"/>
        <ellipse cx="50" cy="64" rx="5" ry="6" fill="#c9a227"/><ellipse cx="70" cy="64" rx="5" ry="6" fill="#c9a227"/>
        <circle cx="50" cy="65" r="2" fill="#1a130c"/><circle cx="70" cy="65" r="2" fill="#1a130c"/>
        <path d="M42 78 Q60 70 78 78 L74 96 L46 96 Z" fill="#241a30"/>
        <rect x="82" y="70" width="6" height="34" rx="2" fill="#8fa0b8" transform="rotate(25 82 70)"/>
      </svg>`;
      case 'orc': return `<svg viewBox="0 0 120 120">${glow}
        <ellipse cx="60" cy="102" rx="34" ry="8" fill="#000" opacity="0.35"/>
        <path d="M60 24 C38 24 28 44 32 62 C22 66 24 84 36 92 L84 92 C96 84 98 66 88 62 C92 44 82 24 60 24 Z" fill="#3d5c3d"/>
        <path d="M30 40 L14 26 L34 46 Z" fill="#3d5c3d"/><path d="M90 40 L106 26 L86 46 Z" fill="#3d5c3d"/>
        <ellipse cx="47" cy="58" rx="6.5" ry="7.5" fill="#e6c34a"/><ellipse cx="73" cy="58" rx="6.5" ry="7.5" fill="#e6c34a"/>
        <circle cx="47" cy="59" r="2.6" fill="#1a130c"/><circle cx="73" cy="59" r="2.6" fill="#1a130c"/>
        <path d="M44 78 Q60 88 76 78" stroke="#1a130c" stroke-width="3" fill="none"/>
        <path d="M48 80 L44 90" stroke="#e9dcc0" stroke-width="3"/><path d="M72 80 L76 90" stroke="#e9dcc0" stroke-width="3"/>
        <rect x="4" y="60" width="10" height="46" rx="2" fill="#6b5230"/>
        <path d="M0 56 L20 56 L14 74 L4 74 Z" fill="#8fa0b8"/>
      </svg>`;
      case 'knight': return `<svg viewBox="0 0 120 120">${glow}
        <ellipse cx="60" cy="60" rx="46" ry="46" fill="#7a5a9c" opacity="0.15"/>
        <path d="M60 22 L78 34 L78 52 L60 62 L42 52 L42 34 Z" fill="#3a2c4a"/>
        <rect x="46" y="38" width="28" height="8" fill="#7a5a9c" opacity="0.8"/>
        <path d="M40 60 Q60 50 80 60 L84 100 Q60 110 36 100 Z" fill="#241a30"/>
        <path d="M40 60 Q60 50 80 60 L78 68 Q60 60 42 68 Z" fill="#3a2c4a"/>
        <circle cx="42" cy="52" r="4" fill="#c9a8ff" filter="url(#eg)"/><circle cx="78" cy="52" r="4" fill="#c9a8ff" filter="url(#eg)"/>
        <rect x="16" y="46" width="8" height="50" rx="2" fill="#8fa0b8" transform="rotate(-6 16 46)"/>
        <rect x="10" y="40" width="20" height="8" fill="#8fa0b8" transform="rotate(-6 10 40)"/>
      </svg>`;
      case 'witch': return `<svg viewBox="0 0 120 120">${glow}
        <path d="M60 14 L86 60 L34 60 Z" fill="#241a30"/>
        <ellipse cx="60" cy="60" rx="30" ry="8" fill="#3a2c4a"/>
        <path d="M42 62 C36 62 32 76 36 90 C40 100 80 100 84 90 C88 76 84 62 78 62 Z" fill="#3a2c4a"/>
        <ellipse cx="50" cy="72" rx="5" ry="6" fill="#6fae76"/><ellipse cx="70" cy="72" rx="5" ry="6" fill="#6fae76"/>
        <circle cx="50" cy="73" r="2" fill="#1a130c"/><circle cx="70" cy="73" r="2" fill="#1a130c"/>
        <rect x="86" y="50" width="5" height="56" fill="#6b5230" transform="rotate(10 86 50)"/>
        <circle cx="90" cy="48" r="7" fill="#7a5a9c" filter="url(#eg)"/>
      </svg>`;
      case 'dragon': return `<svg viewBox="0 0 140 140">${glow}
        <ellipse cx="70" cy="118" rx="46" ry="10" fill="#000" opacity="0.35"/>
        <path d="M20 60 L45 40 L55 62 Z" fill="#9c3a2c"/><path d="M120 60 L95 40 L85 62 Z" fill="#9c3a2c"/>
        <path d="M70 26 C46 26 34 48 38 70 C40 96 56 112 70 112 C84 112 100 96 102 70 C106 48 94 26 70 26 Z" fill="#9c3a2c"/>
        <path d="M40 46 L26 20 L50 42 Z" fill="#7a2a20"/><path d="M100 46 L114 20 L90 42 Z" fill="#7a2a20"/>
        <ellipse cx="55" cy="66" rx="7.5" ry="9" fill="#e6c34a" filter="url(#eg)"/><ellipse cx="85" cy="66" rx="7.5" ry="9" fill="#e6c34a" filter="url(#eg)"/>
        <circle cx="55" cy="67" r="3" fill="#1a130c"/><circle cx="85" cy="67" r="3" fill="#1a130c"/>
        <path d="M58 90 Q70 98 82 90" stroke="#1a130c" stroke-width="3" fill="none"/>
        <path d="M56 92 L52 100" stroke="#fff2c0" stroke-width="3"/><path d="M84 92 L88 100" stroke="#fff2c0" stroke-width="3"/>
      </svg>`;
      case 'lich': return `<svg viewBox="0 0 140 140">${glow}
        <ellipse cx="70" cy="120" rx="40" ry="10" fill="#000" opacity="0.35"/>
        <path d="M70 16 L60 34 L80 34 Z" fill="#c9a227"/>
        <circle cx="70" cy="20" r="4" fill="#7a5a9c" filter="url(#eg)"/>
        <ellipse cx="70" cy="52" rx="22" ry="24" fill="#dccba0"/>
        <circle cx="60" cy="50" r="6" fill="#1a130c"/><circle cx="80" cy="50" r="6" fill="#1a130c"/>
        <circle cx="60" cy="50" r="2.6" fill="#7a5a9c" filter="url(#eg)"/><circle cx="80" cy="50" r="2.6" fill="#7a5a9c" filter="url(#eg)"/>
        <path d="M46 76 Q70 66 94 76 L100 116 Q70 128 40 116 Z" fill="#3a2c4a"/>
        <path d="M46 76 Q70 66 94 76 L90 86 Q70 78 50 86 Z" fill="#241a30"/>
        <rect x="14" y="60" width="6" height="60" rx="2" fill="#8fa0b8" transform="rotate(-4 14 60)"/>
        <circle cx="16" cy="56" r="8" fill="#7a5a9c" filter="url(#eg)" opacity="0.85"/>
      </svg>`;
      case 'herowarrior': return heroBossSvg({c1:'#4a2020', c2:'#2a1414', accent:'#8a3a2c', eye:'#ff6a5a'},
        `<rect x="98" y="26" width="9" height="72" rx="2" fill="#c9c9d4" transform="rotate(28 98 26)"/>
         <rect x="94" y="20" width="17" height="9" rx="2" fill="#8fa0b8" transform="rotate(28 94 20)"/>`);
      case 'heromage': return heroBossSvg({c1:'#241a3a', c2:'#150f26', accent:'#4a2c7a', eye:'#9c6fe0'},
        `<rect x="98" y="30" width="5" height="74" rx="2" fill="#6b5230" transform="rotate(8 98 30)"/>
         <circle cx="100" cy="28" r="9" fill="#9c6fe0" filter="url(#eg)"/>`);
      case 'herorogue': return heroBossSvg({c1:'#1a2418', c2:'#0f150e', accent:'#2c4a26', eye:'#8fd66a'},
        `<rect x="30" y="70" width="6" height="30" rx="2" fill="#c9c9d4" transform="rotate(-40 30 70)"/>
         <rect x="104" y="70" width="6" height="30" rx="2" fill="#c9c9d4" transform="rotate(40 104 70)"/>`);
      case 'heropaladin': return heroBossSvg({c1:'#3a3018', c2:'#241c0e', accent:'#8a7020', eye:'#ffe08a'},
        `<ellipse cx="36" cy="86" rx="14" ry="20" fill="#8a7020" opacity="0.9"/>
         <path d="M30 74 L42 74 L42 98 L36 104 L30 98 Z" fill="#ffe08a" opacity="0.9"/>`);
      case 'heromechanic': return heroBossSvg({c1:'#3a2810', c2:'#241808', accent:'#8a5a20', eye:'#ffb15a'},
        `<circle cx="100" cy="80" r="13" fill="none" stroke="#ffb15a" stroke-width="5"/>
         <circle cx="100" cy="80" r="4" fill="#ffb15a" filter="url(#eg)"/>`);
      case 'herojester': return heroBossSvg({c1:'#3a1830', c2:'#24101e', accent:'#8a2c7a', eye:'#e06fd6'},
        `<ellipse cx="40" cy="82" rx="12" ry="15" fill="#e06fd6" opacity="0.85" transform="rotate(-16 40 82)"/>
         <ellipse cx="100" cy="82" rx="12" ry="15" fill="#241a30" stroke="#e06fd6" stroke-width="2" transform="rotate(16 100 82)"/>`);
      case 'progenitor': return heroBossSvg({c1:'#1c1608', c2:'#100c05', accent:'#ffe08a', eye:'#fff8e0'},
        `<path d="M50 14 L58 26 L70 16 L82 26 L90 14 L86 34 L54 34 Z" fill="#ffe08a" filter="url(#eg2)"/>
         <circle cx="70" cy="14" r="4" fill="#fff8e0" filter="url(#eg2)"/>
         <rect x="24" y="46" width="6" height="56" rx="2" fill="#e6c34a" opacity="0.9" transform="rotate(-14 24 46)"/>
         <rect x="110" y="46" width="6" height="56" rx="2" fill="#e6c34a" opacity="0.9" transform="rotate(14 110 46)"/>`);
      case 'bat': return `<svg viewBox="0 0 120 120">${glow}
        <path d="M60 50 L20 30 L35 55 L10 60 L35 68 L20 90 L60 72 Z" fill="#241d17" opacity="0.92"/>
        <path d="M60 50 L100 30 L85 55 L110 60 L85 68 L100 90 L60 72 Z" fill="#241d17" opacity="0.92"/>
        <ellipse cx="60" cy="62" rx="14" ry="16" fill="#1a130c"/>
        <circle cx="55" cy="60" r="3" fill="#d1543c" filter="url(#eg)"/><circle cx="65" cy="60" r="3" fill="#d1543c" filter="url(#eg)"/>
        <path d="M52 50 L48 40" stroke="#1a130c" stroke-width="3"/><path d="M68 50 L72 40" stroke="#1a130c" stroke-width="3"/>
      </svg>`;
      case 'spider': return `<svg viewBox="0 0 120 120">${glow}
        <ellipse cx="60" cy="70" rx="22" ry="18" fill="#1a1510"/>
        <ellipse cx="60" cy="50" rx="12" ry="10" fill="#241d17"/>
        <circle cx="55" cy="48" r="2.6" fill="#e6c34a"/><circle cx="65" cy="48" r="2.6" fill="#e6c34a"/>
        <circle cx="52" cy="52" r="2" fill="#e6c34a"/><circle cx="68" cy="52" r="2" fill="#e6c34a"/>
        <path d="M40 60 L14 48" stroke="#1a1510" stroke-width="4"/><path d="M40 68 L10 68" stroke="#1a1510" stroke-width="4"/>
        <path d="M40 76 L14 90" stroke="#1a1510" stroke-width="4"/><path d="M42 84 L20 104" stroke="#1a1510" stroke-width="4"/>
        <path d="M80 60 L106 48" stroke="#1a1510" stroke-width="4"/><path d="M80 68 L110 68" stroke="#1a1510" stroke-width="4"/>
        <path d="M80 76 L106 90" stroke="#1a1510" stroke-width="4"/><path d="M78 84 L100 104" stroke="#1a1510" stroke-width="4"/>
      </svg>`;
      case 'ghost': return `<svg viewBox="0 0 120 120">${glow}
        <path d="M60 26 C40 26 30 44 30 62 L30 96 L40 86 L48 98 L60 86 L72 98 L80 86 L90 96 L90 62 C90 44 80 26 60 26 Z" fill="#dccba0" opacity="0.55"/>
        <ellipse cx="49" cy="58" rx="6" ry="7" fill="#3a2c4a"/><ellipse cx="71" cy="58" rx="6" ry="7" fill="#3a2c4a"/>
        <circle cx="49" cy="59" r="2.4" fill="#7a5a9c" filter="url(#eg)"/><circle cx="71" cy="59" r="2.4" fill="#7a5a9c" filter="url(#eg)"/>
        <ellipse cx="60" cy="72" rx="5" ry="7" fill="#3a2c4a" opacity="0.7"/>
      </svg>`;
      case 'mimic': return `<svg viewBox="0 0 120 120">${glow}
        <rect x="26" y="66" width="68" height="34" rx="4" fill="#6b5230"/>
        <path d="M24 66 Q60 40 96 66 Z" fill="#8a6f3f"/>
        <rect x="26" y="66" width="68" height="8" fill="#c9a227"/>
        <path d="M40 66 Q60 56 80 66 L74 82 Q60 90 46 82 Z" fill="#1a130c"/>
        <circle cx="52" cy="72" r="3.5" fill="#d1543c" filter="url(#eg)"/><circle cx="68" cy="72" r="3.5" fill="#d1543c" filter="url(#eg)"/>
        <path d="M44 82 L40 96" stroke="#e9dcc0" stroke-width="3"/><path d="M76 82 L80 96" stroke="#e9dcc0" stroke-width="3"/>
      </svg>`;
      case 'ogre': return `<svg viewBox="0 0 140 140">${glow}
        <ellipse cx="70" cy="122" rx="40" ry="9" fill="#000" opacity="0.35"/>
        <path d="M70 26 C44 26 32 50 36 72 C24 78 26 100 40 110 L100 110 C114 100 116 78 104 72 C108 50 96 26 70 26 Z" fill="#5c6b3f"/>
        <ellipse cx="53" cy="68" rx="7" ry="8" fill="#e6c34a"/><ellipse cx="87" cy="68" rx="7" ry="8" fill="#e6c34a"/>
        <circle cx="53" cy="69" r="2.8" fill="#1a130c"/><circle cx="87" cy="69" r="2.8" fill="#1a130c"/>
        <path d="M50 92 Q70 102 90 92" stroke="#1a130c" stroke-width="3" fill="none"/>
        <path d="M54 94 L50 104" stroke="#e9dcc0" stroke-width="3.5"/><path d="M86 94 L90 104" stroke="#e9dcc0" stroke-width="3.5"/>
        <rect x="6" y="70" width="14" height="52" rx="3" fill="#6b5230"/>
        <circle cx="13" cy="66" r="12" fill="#4a3a24"/>
      </svg>`;
      case 'harpy': return `<svg viewBox="0 0 120 120">${glow}
        <path d="M60 40 L20 55 L45 62 L15 78 L48 74 L60 96 L72 74 L105 78 L75 62 L100 55 Z" fill="#5c4a30"/>
        <ellipse cx="60" cy="56" rx="12" ry="13" fill="#8a6f3f"/>
        <circle cx="55" cy="54" r="2.6" fill="#e6c34a"/><circle cx="65" cy="54" r="2.6" fill="#e6c34a"/>
        <circle cx="55" cy="54" r="1.2" fill="#1a130c"/><circle cx="65" cy="54" r="1.2" fill="#1a130c"/>
        <path d="M57 60 L60 65 L63 60 Z" fill="#c9a227"/>
      </svg>`;
      case 'wraith': return `<svg viewBox="0 0 120 120">${glow}
        <path d="M60 20 C38 20 30 40 34 60 C24 70 26 100 40 108 L80 108 C94 100 96 70 86 60 C90 40 82 20 60 20 Z" fill="#241a30" opacity="0.85"/>
        <ellipse cx="48" cy="54" rx="5.5" ry="7" fill="#7a5a9c" filter="url(#eg)"/><ellipse cx="72" cy="54" rx="5.5" ry="7" fill="#7a5a9c" filter="url(#eg)"/>
        <path d="M40 88 Q60 96 80 88" stroke="#3a2c4a" stroke-width="4" fill="none"/>
      </svg>`;
      case 'cultist': return `<svg viewBox="0 0 120 120">${glow}
        <path d="M60 24 L84 60 L36 60 Z" fill="#3a2c1c"/>
        <ellipse cx="60" cy="66" rx="26" ry="10" fill="#241a1a"/>
        <path d="M42 68 C36 68 32 82 36 96 C40 106 80 106 84 96 C88 82 84 68 78 68 Z" fill="#241a1a"/>
        <circle cx="50" cy="80" r="4" fill="#d1543c" filter="url(#eg)"/><circle cx="70" cy="80" r="4" fill="#d1543c" filter="url(#eg)"/>
        <circle cx="60" cy="40" r="6" fill="#9c3a2c" filter="url(#eg)"/>
      </svg>`;
      case 'minotaur': return `<svg viewBox="0 0 140 140">${glow}
        <ellipse cx="70" cy="120" rx="42" ry="9" fill="#000" opacity="0.35"/>
        <path d="M70 28 C46 28 34 50 38 70 C28 76 30 98 44 108 L96 108 C110 98 112 76 102 70 C106 50 94 28 70 28 Z" fill="#5c4030"/>
        <path d="M40 44 L20 24 L46 38 Z" fill="#dccba0"/><path d="M100 44 L120 24 L94 38 Z" fill="#dccba0"/>
        <ellipse cx="55" cy="68" rx="7" ry="8" fill="#d1543c" filter="url(#eg)"/><ellipse cx="85" cy="68" rx="7" ry="8" fill="#d1543c" filter="url(#eg)"/>
        <path d="M58 90 Q70 84 82 90" stroke="#1a130c" stroke-width="3" fill="none"/>
        <path d="M64 92 L60 100" stroke="#e9dcc0" stroke-width="3"/><path d="M76 92 L80 100" stroke="#e9dcc0" stroke-width="3"/>
        <rect x="8" y="66" width="10" height="50" rx="2" fill="#6b5230" transform="rotate(-10 8 66)"/>
      </svg>`;
      case 'golem': return `<svg viewBox="0 0 140 140">${glow}
        <ellipse cx="70" cy="122" rx="42" ry="9" fill="#000" opacity="0.3"/>
        <rect x="32" y="34" width="76" height="80" rx="8" fill="#5a5a52"/>
        <rect x="32" y="34" width="76" height="80" rx="8" fill="none" stroke="#3a3a34" stroke-width="4"/>
        <circle cx="54" cy="62" r="7" fill="#c9a227" filter="url(#eg)"/><circle cx="86" cy="62" r="7" fill="#c9a227" filter="url(#eg)"/>
        <rect x="16" y="50" width="16" height="46" rx="4" fill="#4a4a44"/><rect x="108" y="50" width="16" height="46" rx="4" fill="#4a4a44"/>
        <rect x="46" y="90" width="48" height="8" fill="#3a3a34"/>
      </svg>`;
      case 'treant': return `<svg viewBox="0 0 140 140">${glow}
        <ellipse cx="70" cy="122" rx="40" ry="9" fill="#000" opacity="0.3"/>
        <path d="M70 30 C50 30 38 50 42 68 C30 74 32 96 48 108 L92 108 C108 96 110 74 98 68 C102 50 90 30 70 30 Z" fill="#4a3a24"/>
        <ellipse cx="54" cy="64" rx="6" ry="7" fill="#e6c34a" filter="url(#eg)"/><ellipse cx="86" cy="64" rx="6" ry="7" fill="#e6c34a" filter="url(#eg)"/>
        <path d="M40 40 Q30 24 40 10" stroke="#3d5c3d" stroke-width="6" fill="none"/>
        <path d="M100 40 Q110 24 100 10" stroke="#3d5c3d" stroke-width="6" fill="none"/>
        <path d="M56 86 Q70 94 84 86" stroke="#241a10" stroke-width="3" fill="none"/>
      </svg>`;
      case 'demon': return `<svg viewBox="0 0 140 140">${glow}
        <ellipse cx="70" cy="122" rx="42" ry="9" fill="#000" opacity="0.35"/>
        <path d="M70 30 C48 30 36 50 40 70 C30 76 32 98 46 108 L94 108 C108 98 110 76 100 70 C104 50 92 30 70 30 Z" fill="#5a1f1a"/>
        <path d="M42 42 L26 16 L52 36 Z" fill="#3a1310"/><path d="M98 42 L114 16 L88 36 Z" fill="#3a1310"/>
        <ellipse cx="56" cy="66" rx="6.5" ry="8" fill="#e6c34a" filter="url(#eg)"/><ellipse cx="84" cy="66" rx="6.5" ry="8" fill="#e6c34a" filter="url(#eg)"/>
        <circle cx="56" cy="67" r="2.6" fill="#1a130c"/><circle cx="84" cy="67" r="2.6" fill="#1a130c"/>
        <path d="M56 88 Q70 96 84 88" stroke="#1a130c" stroke-width="3" fill="none"/>
        <path d="M60 90 L56 98" stroke="#fff2c0" stroke-width="3"/><path d="M80 90 L84 98" stroke="#fff2c0" stroke-width="3"/>
      </svg>`;
            case 'kraken': return `<svg viewBox="0 0 140 140">${glow}
        <ellipse cx="70" cy="124" rx="46" ry="8" fill="#000" opacity="0.35"/>
        <path d="M22 90 Q10 70 26 54 Q20 74 34 88 Z" fill="#1f4a4a"/>
        <path d="M118 90 Q130 70 114 54 Q120 74 106 88 Z" fill="#1f4a4a"/>
        <path d="M30 108 Q14 100 12 118 Q28 124 36 112 Z" fill="#1f4a4a"/>
        <path d="M110 108 Q126 100 128 118 Q112 124 104 112 Z" fill="#1f4a4a"/>
        <ellipse cx="70" cy="70" rx="38" ry="34" fill="#183838"/>
        <ellipse cx="58" cy="66" rx="9" ry="10" fill="#5adede" filter="url(#eg)"/><ellipse cx="82" cy="66" rx="9" ry="10" fill="#5adede" filter="url(#eg)"/>
        <circle cx="58" cy="67" r="3.4" fill="#0a1a1a"/><circle cx="82" cy="67" r="3.4" fill="#0a1a1a"/>
        <path d="M52 90 Q70 98 88 90" stroke="#0a1a1a" stroke-width="3" fill="none"/>
      </svg>`;
      case 'ironjudge': return `<svg viewBox="0 0 140 140">${glow}
        <ellipse cx="70" cy="124" rx="44" ry="9" fill="#000" opacity="0.35"/>
        <rect x="34" y="32" width="72" height="78" rx="6" fill="#3a3228"/>
        <rect x="34" y="32" width="72" height="78" rx="6" fill="none" stroke="#221d16" stroke-width="4"/>
        <path d="M70 32 L58 14 L82 14 Z" fill="#5a4c34"/>
        <circle cx="70" cy="66" r="11" fill="#ff8a3a" filter="url(#eg)"/>
        <circle cx="70" cy="66" r="4" fill="#ffe6b0"/>
        <rect x="14" y="46" width="14" height="56" rx="3" fill="#4a4030"/><rect x="112" y="46" width="14" height="56" rx="3" fill="#4a4030"/>
        <path d="M14 46 L6 30 L24 40 Z" fill="#ffb15a"/><path d="M126 46 L134 30 L116 40 Z" fill="#ffb15a"/>
        <rect x="48" y="92" width="44" height="8" fill="#221d16"/>
      </svg>`;
      case 'wraithqueen': return `<svg viewBox="0 0 140 140">${glow}
        <path d="M70 24 C44 24 30 48 34 72 C20 82 24 112 42 118 L98 118 C116 112 120 82 106 72 C110 48 96 24 70 24 Z" fill="#2c1c3a" opacity="0.9"/>
        <path d="M52 20 L70 4 L88 20 L78 22 L70 14 L62 22 Z" fill="#c264d1"/>
        <ellipse cx="56" cy="62" rx="7" ry="9" fill="#e089f0" filter="url(#eg)"/><ellipse cx="84" cy="62" rx="7" ry="9" fill="#e089f0" filter="url(#eg)"/>
        <circle cx="56" cy="63" r="2.8" fill="#1a0f22"/><circle cx="84" cy="63" r="2.8" fill="#1a0f22"/>
        <path d="M50 92 Q70 102 90 92" stroke="#1a0f22" stroke-width="3" fill="none"/>
      </svg>`;
      default: return `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="40" fill="#5c4a30"/></svg>`;
    }
  }

  // ---------- 메카닉 로봇(가동 장치) 비주얼 ----------
  // battleFlags.rig/rig2의 kind에 대응하는 작은 로봇 SVG. 적 화면 하단 좌우
  // 슬롯에 그려진다(combat/battle-fx.js의 updateRigVisuals() 참고). 사용자
  // 요청: "설치한 로봇들이 눈에 보여야 재미있다" — 이전엔 battleFlags 안의
  // 순수 데이터였을 뿐 화면에 전혀 그려지지 않았다.
  function svgRig(kind){
    const glow = `<filter id="rg"><feGaussianBlur stdDeviation="1"/></filter>`;
    switch(kind){
      case 'recon': return `<svg viewBox="0 0 70 50">${glow}
        <rect x="20" y="26" width="30" height="18" rx="4" fill="#1a3a3a"/>
        <circle cx="35" cy="18" r="10" fill="#0f2626" stroke="#5adede" stroke-width="2"/>
        <circle cx="35" cy="18" r="4" fill="#5adede" filter="url(#rg)"/>
        <rect x="14" y="40" width="8" height="8" fill="#0f2626"/><rect x="48" y="40" width="8" height="8" fill="#0f2626"/>
        <line x1="35" y1="8" x2="35" y2="2" stroke="#5adede" stroke-width="2"/>
      </svg>`;
      case 'firepower': return `<svg viewBox="0 0 70 50">${glow}
        <rect x="18" y="22" width="34" height="22" rx="4" fill="#3a1a12"/>
        <circle cx="35" cy="20" r="9" fill="#241008" stroke="#ff8a3a" stroke-width="2"/>
        <rect x="35" y="14" width="26" height="7" rx="2" fill="#ff8a3a" filter="url(#rg)"/>
        <rect x="14" y="40" width="8" height="8" fill="#241008"/><rect x="48" y="40" width="8" height="8" fill="#241008"/>
      </svg>`;
      case 'shield': return `<svg viewBox="0 0 70 50">${glow}
        <rect x="18" y="24" width="34" height="20" rx="4" fill="#0f2a16"/>
        <circle cx="35" cy="18" r="9" fill="#0a1c0e" stroke="#6fe08a" stroke-width="2"/>
        <path d="M35 6 C28 6 24 12 24 18 C24 24 30 28 35 30 C40 28 46 24 46 18 C46 12 42 6 35 6 Z" fill="none" stroke="#6fe08a" stroke-width="2" opacity="0.85"/>
        <rect x="14" y="40" width="8" height="8" fill="#0a1c0e"/><rect x="48" y="40" width="8" height="8" fill="#0a1c0e"/>
      </svg>`;
      case 'turret': return `<svg viewBox="0 0 70 50">${glow}
        <rect x="20" y="28" width="30" height="16" rx="3" fill="#3a3a34"/>
        <rect x="28" y="12" width="14" height="18" rx="3" fill="#4a4a44"/>
        <rect x="34" y="6" width="22" height="6" rx="2" fill="#8fa0b8"/>
      </svg>`;
      // 오메가 유닛(메카닉 3세트 재전개 전용, kind:'omega'): 사용자 요청으로
      // 좌우로 길게 뻗은 포신 두 개를 가진 형태로 그렸다 — 자기 슬롯(왼쪽 또는
      // 오른쪽) 안에서 가운데 방향으로 폭이 넓어지는 방식으로 표시되어(.rig-wide
      // CSS 클래스), 반대편 슬롯의 다른 로봇을 가리지 않는다(combat/battle-fx.js
      // 의 updateRigVisuals() 참고).
      case 'omega': return `<svg viewBox="0 0 220 50">${glow}
        <rect x="70" y="18" width="80" height="24" rx="6" fill="#241030"/>
        <rect x="70" y="18" width="80" height="24" rx="6" fill="none" stroke="#c9a8ff" stroke-width="2"/>
        <circle cx="110" cy="30" r="9" fill="#3a2050" stroke="#e6c34a" stroke-width="2"/>
        <circle cx="110" cy="30" r="3.5" fill="#ffe08a" filter="url(#rg)"/>
        <rect x="0" y="24" width="66" height="10" rx="3" fill="#3a2050"/>
        <rect x="154" y="24" width="66" height="10" rx="3" fill="#3a2050"/>
        <circle cx="6" cy="29" r="6" fill="#c9a8ff" filter="url(#rg)"/>
        <circle cx="214" cy="29" r="6" fill="#c9a8ff" filter="url(#rg)"/>
      </svg>`;
      default: return `<svg viewBox="0 0 70 50"><rect x="20" y="20" width="30" height="20" rx="4" fill="#4a4a44"/></svg>`;
    }
  }

  // 몬스터 PNG를 게임 로드 시점에 미리 받아둔다(사용자 피드백 — "몬스터 이미지가
  // 몇 초씩 늦게 나온다"). 예전엔 startBattle()에서 <img> 태그가 생성되는
  // 그 순간에야 브라우저가 다운로드를 시작했는데, 픽셀아트 원본 해상도가 커서
  // 그때부터 받으면 몇 초씩 지연됐다. 이 파일이 로드되는 즉시(=타이틀 화면이
  // 뜨는 시점부터) 미리 fetch해 브라우저 캐시에 담아두면, 실제 전투에서는
  // 캐시된 이미지를 즉시 보여줄 수 있다. new Image()만 만들고 화면에 붙이지는
  // 않으므로 레이아웃에는 전혀 영향 없다.
  (function preloadMonsterImages(){
    Object.values(MONSTER_IMG).forEach(src=>{
      const img = new Image();
      img.src = src;
    });
  })();

  // ---------- 던전 배경(구역별) ----------
  // data/monsters.js의 LOCATIONS와 정확히 동일한 depth 경계(9/19/29/39/49)를
  // 쓴다 — 층이 깊어질수록 dungeon1.png→dungeon6.png로 점점 더 불길한 배경으로
  // 바뀐다. combat/battle-setup.js의 startBattle()에서 getDungeonBgForDepth(depth)
  // 로 매 전투 시작 시 .archway의 배경을 이 값으로 갈아끼운다.
  const DUNGEON_BG_ZONES = [
    {maxDepth:9,   file:'images/backgrounds/dungeon1.png'},
    {maxDepth:19,  file:'images/backgrounds/dungeon2.png'},
    {maxDepth:29,  file:'images/backgrounds/dungeon3.png'},
    {maxDepth:39,  file:'images/backgrounds/dungeon4.png'},
    {maxDepth:49,  file:'images/backgrounds/dungeon5.png'},
    {maxDepth:9999,file:'images/backgrounds/dungeon6.png'},
  ];
  function getDungeonBgForDepth(d){
    for(const z of DUNGEON_BG_ZONES){ if(d<=z.maxDepth) return z.file; }
    return DUNGEON_BG_ZONES[DUNGEON_BG_ZONES.length-1].file;
  }
  // 몬스터 이미지와 동일한 이유로, 던전 배경 6장도 게임을 켜는 시점부터 전부
  // 미리 받아둔다 — 나중에 깊은 층에 처음 도달했을 때도 배경이 몇 초씩 늦게
  // 뜨는 일이 없게 하기 위함이다.
  (function preloadDungeonBackgrounds(){
    DUNGEON_BG_ZONES.forEach(z=>{
      const img = new Image();
      img.src = z.file;
    });
  })();
