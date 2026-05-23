/* ──────────────────────────────────────────────────────────────────────────
   Mwktai — bilingual (English / Bengali) front-end layer

   English is the source. When the visitor has chosen Bengali, this script
   swaps every known text string to বাংলা on load (and for dynamically added
   content via a MutationObserver). English mode is a no-op — the page renders
   exactly as authored.

   Other scripts can register more translations at runtime — e.g. the
   storefront registers product name/description pairs:
       window.MwktaiI18n.addTranslations({ "Risa Heritage Set": "..." });
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // ── Current language ──────────────────────────────────────────────────────
  function getLang() {
    const m = document.cookie.match(/(?:^|;\s*)mwktai_lang=([^;]+)/);
    if (m) return m[1];
    try { return localStorage.getItem('mwktai_lang') || 'en'; } catch (e) { return 'en'; }
  }
  const LANG = getLang();

  function setLang(lang) {
    document.cookie = 'mwktai_lang=' + lang + ';path=/;max-age=31536000';
    try { localStorage.setItem('mwktai_lang', lang); } catch (e) {}
    window.location.reload();
  }

  // ── Bengali dictionary (English string → বাংলা) ───────────────────────────
  const DICT = {
    // Navigation
    'HOME': 'হোম',
    "Women's": 'নারী',
    "Men's": 'পুরুষ',
    'Jewellery': 'গয়না',
    'Home Décor': 'গৃহসজ্জা',
    'Contact': 'যোগাযোগ',
    'Help': 'সহায়তা',
    'Track Order': 'অর্ডার ট্র্যাক',
    "Women's Wear": 'নারীদের পোশাক',
    "Men's Wear": 'পুরুষদের পোশাক',
    // Buttons / actions
    'SHOP THIS →': 'এটি দেখুন →',
    'SHOP THIS': 'এটি দেখুন',
    'SHOP NOW': 'এখন কিনুন',
    'BUY NOW': 'এখনই কিনুন',
    'OUT OF STOCK': 'স্টক শেষ',
    'PAY & PLACE ORDER': 'পেমেন্ট করে অর্ডার দিন',
    'PLACE ORDER': 'অর্ডার দিন',
    'NOTIFY ME WHEN LIVE': 'লাইভ হলে জানান',
    'RETRY': 'আবার চেষ্টা করুন',
    // Order modal
    'Place Your Order': 'আপনার অর্ডার দিন',
    'Your Name': 'আপনার নাম',
    'Phone Number': 'ফোন নম্বর',
    'Email (for order updates)': 'ইমেল (অর্ডার আপডেটের জন্য)',
    'Delivery Address': 'ডেলিভারি ঠিকানা',
    'Order Placed!': 'অর্ডার সম্পন্ন হয়েছে!',
    'Secure payment by Razorpay.': 'Razorpay-এর মাধ্যমে নিরাপদ পেমেন্ট।',
    'Free shipping across India.': 'সারা ভারতে বিনামূল্যে ডেলিভারি।',
    "We'll confirm your order within a few hours.": 'আমরা কয়েক ঘণ্টার মধ্যে আপনার অর্ডার নিশ্চিত করব।',
    'Thank you. We’ve received your order and will reach out to confirm delivery details shortly.':
      'ধন্যবাদ। আমরা আপনার অর্ডার পেয়েছি এবং শীঘ্রই ডেলিভারির বিবরণ নিশ্চিত করতে যোগাযোগ করব।',
    // Loading / states
    'Loading…': 'লোড হচ্ছে…',
    'Loading our collection…': 'আমাদের সংগ্রহ লোড হচ্ছে…',
    'Opening payment...': 'পেমেন্ট খোলা হচ্ছে...',
    'Saving order...': 'অর্ডার সংরক্ষণ করা হচ্ছে...',
    // Footer
    'WOVEN WITH HERITAGE · ADORNED WITH TRADITION · MADE WITH LOVE':
      'ঐতিহ্যে বোনা · পরম্পরায় সাজানো · ভালোবাসায় তৈরি',
    '© 2025 MWKTAI · ALL RIGHTS RESERVED': '© ২০২৫ মৃকতাই · সর্বস্বত্ব সংরক্ষিত',
    // Placeholders
    'Full name': 'পুরো নাম',
    '10-digit mobile number': '১০ সংখ্যার মোবাইল নম্বর',
    'House, Street, City, PIN': 'বাড়ি, রাস্তা, শহর, পিন',
    // Page heroes
    'Indigenous Handloom': 'আদিবাসী হস্তচালিত তাঁত',
    'Artisan Silver': 'কারিগরি রৌপ্য',
    'Bamboo & Cane': 'বাঁশ ও বেত',
    'Home Décor': 'গৃহসজ্জা',
  };

  // ── Public API (other scripts add product translations here) ──────────────
  function addTranslations(map) {
    if (!map) return;
    Object.keys(map).forEach(function (k) {
      if (k && map[k]) DICT[k.trim()] = map[k];
    });
    apply();
  }

  // ── DOM translation ───────────────────────────────────────────────────────
  let observer = null;

  function translateAttrs(el) {
    ['placeholder', 'title', 'alt', 'aria-label'].forEach(function (attr) {
      if (el.hasAttribute && el.hasAttribute(attr)) {
        const v = el.getAttribute(attr).trim();
        if (DICT[v]) el.setAttribute(attr, DICT[v]);
      }
    });
  }

  function apply() {
    if (LANG !== 'bn') return;
    if (observer) observer.disconnect();

    // Text nodes
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        const p = node.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.nodeName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest('[data-no-i18n]')) return NodeFilter.FILTER_REJECT;
        return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      const raw = node.nodeValue;
      const key = raw.trim();
      if (DICT[key]) {
        // Preserve leading / trailing whitespace around the swapped text.
        const lead = raw.match(/^\s*/)[0];
        const tail = raw.match(/\s*$/)[0];
        node.nodeValue = lead + DICT[key] + tail;
      }
    });

    // Attributes (placeholder, title, alt, aria-label)
    const els = document.body.querySelectorAll('input,textarea,img,[title],[aria-label]');
    els.forEach(translateAttrs);

    if (observer) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // ── Bengali font + <html> marker ──────────────────────────────────────────
  function installFont() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Noto+Serif+Bengali:wght@400;600;700&display=swap';
    document.head.appendChild(link);
    const style = document.createElement('style');
    style.textContent =
      'html.lang-bn body, html.lang-bn body :not(script):not(style)' +
      '{font-family:"Noto Serif Bengali",serif !important;}';
    document.head.appendChild(style);
    document.documentElement.classList.add('lang-bn');
  }

  // ── Language toggle in the nav ────────────────────────────────────────────
  function installToggle() {
    const t = document.createElement('div');
    t.setAttribute('data-no-i18n', '');
    t.style.cssText =
      'display:inline-flex;gap:6px;align-items:center;font-family:Cinzel,serif;' +
      'font-size:0.6rem;letter-spacing:0.12em;margin-left:18px;';
    const mk = function (label, lang) {
      const b = document.createElement('span');
      b.textContent = label;
      b.style.cssText =
        'cursor:pointer;padding:3px 7px;border-radius:2px;transition:all .2s;' +
        (LANG === lang
          ? 'background:#C8972A;color:#1A0A00;'
          : 'color:rgba(250,243,232,0.5);border:1px solid rgba(200,151,42,0.3);');
      if (LANG !== lang) b.onclick = function () { setLang(lang); };
      return b;
    };
    t.appendChild(mk('EN', 'en'));
    t.appendChild(mk('বাং', 'bn'));
    const nav = document.querySelector('.top-nav');
    if (nav) {
      nav.appendChild(t);
    } else {
      t.style.cssText += 'position:fixed;top:10px;right:14px;z-index:999;';
      document.body.appendChild(t);
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    installToggle();
    if (LANG === 'bn') {
      installFont();
      observer = new MutationObserver(function () {
        clearTimeout(observer._t);
        observer._t = setTimeout(apply, 60);
      });
      apply();
    }
  }

  window.MwktaiI18n = { lang: LANG, addTranslations: addTranslations, setLang: setLang };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
