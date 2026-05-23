/* ──────────────────────────────────────────────────────────────────────────
   Mwktai — bilingual (English / Bengali) front-end layer

   English is the source. When the visitor has chosen Bengali, this script
   swaps every known text string to বাংলা on load (and for dynamically added
   content via a MutationObserver). English mode is a no-op.

   Matching is whitespace-normalised: a DOM text node's content is collapsed
   (all runs of whitespace, including &nbsp;, become a single space, then
   trimmed) before lookup — so decorative headers like "✦  X  ✦" still match.

   Other scripts can register more translations at runtime — the storefront
   registers product name/description pairs via:
       window.MwktaiI18n.addTranslations({ "Risa Heritage Set": "..." });
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

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

  function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }

  // ── Bengali dictionary (normalised English string → বাংলা) ────────────────
  const DICT = {
    // ── Dynamic / JS-rendered UI ──
    'HOME': 'হোম',
    "Women's": 'নারী',
    "Men's": 'পুরুষ',
    'Jewellery': 'গয়না',
    'Home Décor': 'গৃহসজ্জা',
    'Contact': 'যোগাযোগ',
    'Help': 'সহায়তা',
    'Track Order': 'অর্ডার ট্র্যাক করুন',
    'BUY NOW': 'এখনই কিনুন',
    'OUT OF STOCK': 'স্টক শেষ',
    'PAY & PLACE ORDER': 'পেমেন্ট করে অর্ডার দিন',
    'PLACE ORDER': 'অর্ডার দিন',
    'Loading…': 'লোড হচ্ছে…',
    'Opening payment...': 'পেমেন্ট খোলা হচ্ছে...',
    'Saving order...': 'অর্ডার সংরক্ষণ করা হচ্ছে...',
    'RETRY': 'আবার চেষ্টা করুন',

    // ── Home page (index.html) ──
    'Mwktai — Heritage Collection': 'মৃকতাই — ঐতিহ্য সংগ্রহ',
    'EST. NORTHEAST INDIA · INDIGENOUS ARTISTRY': 'প্রতিষ্ঠিত উত্তর-পূর্ব ভারত · আদিবাসী শিল্পকলা',
    'WOVEN WITH HERITAGE · ADORNED WITH TRADITION': 'ঐতিহ্যে বোনা · পরম্পরায় সাজানো',
    "Preserving the sacred textile traditions of Tripura's indigenous communities — each thread, bead, and silver coin a testament to centuries of craftsmanship.":
      'ত্রিপুরার আদিবাসী সম্প্রদায়ের পবিত্র বস্ত্রশিল্পের ঐতিহ্য সংরক্ষণ — প্রতিটি সুতো, পুঁতি ও রুপোর মুদ্রা শতাব্দীর কারুশিল্পের সাক্ষ্য।',
    'HERITAGE COLLECTION 2025': 'ঐতিহ্য সংগ্রহ ২০২৫',
    'Living the Risa & Pachra': 'রিসা ও পাছড়ার যাপন',
    'Traditional handwoven garments of Tripura — the Risa, Rignai, and Pachra — worn with pride by the indigenous Tripuri people for generations.':
      'ত্রিপুরার ঐতিহ্যবাহী হস্তবোনা পোশাক — রিসা, রিগনাই ও পাছড়া — প্রজন্মের পর প্রজন্ম ধরে আদিবাসী ত্রিপুরি জনগোষ্ঠী গর্বের সঙ্গে পরে আসছেন।',
    "WOMEN'S HERITAGE · RISA COLLECTION": 'নারীদের ঐতিহ্য · রিসা সংগ্রহ',
    'Risa & Rignai': 'রিসা ও রিগনাই',
    'Hand-woven body cloth adorned with traditional motifs, paired with silver coin necklaces and statement earrings of the Tripuri tradition.':
      'ঐতিহ্যবাহী নকশায় সজ্জিত হস্তবোনা বস্ত্র, ত্রিপুরি পরম্পরার রুপোর মুদ্রার হার ও দৃষ্টিনন্দন কানের দুলের সঙ্গে।',
    'EXPLORE COLLECTION': 'সংগ্রহ দেখুন',
    "MEN'S HERITAGE · KUBAI COLLECTION": 'পুরুষদের ঐতিহ্য · কুবাই সংগ্রহ',
    'Kubai & Rignai Dhoti': 'কুবাই ও রিগনাই ধুতি',
    'Vibrant handloom shirt woven in sacred crimson and gold stripes, paired with the traditional white dhoti — timeless Tripuri masculinity.':
      'পবিত্র লাল ও সোনালি ডোরায় বোনা প্রাণবন্ত হস্তচালিত তাঁতের জামা, ঐতিহ্যবাহী সাদা ধুতির সঙ্গে — চিরন্তন ত্রিপুরি পৌরুষ।',
    'SILVER JEWELLERY · ARTISAN CRAFTED': 'রুপোর গয়না · কারিগরি নির্মিত',
    'Mwktai & Necklace': 'মৃকতাই ও হার',
    'Hand-hammered silver torque necklaces and coin pendants — each piece forged by generations of Tripuri silversmiths.':
      'হাতে-পেটানো রুপোর টর্ক হার ও মুদ্রার পেন্ডেন্ট — প্রতিটি ত্রিপুরি রৌপ্যকারদের প্রজন্মের হাতে তৈরি।',
    'SHOP JEWELLERY': 'গয়না কিনুন',
    'HOME DÉCOR · BAMBOO & CANE': 'গৃহসজ্জা · বাঁশ ও বেত',
    'Bamboo Crafts': 'বাঁশের কারুশিল্প',
    'Handcrafted bamboo lamps, baskets, furniture and décor — the living forest transformed by artisan hands.':
      'হাতে তৈরি বাঁশের বাতি, ঝুড়ি, আসবাব ও সাজসজ্জা — কারিগরের হাতে রূপান্তরিত জীবন্ত অরণ্য।',
    'EXPLORE DÉCOR': 'সাজসজ্জা দেখুন',
    'ARTISAN SILVER · SINCE ANTIQUITY': 'কারিগরি রুপো · প্রাচীনকাল থেকে',
    'The Sacred Silver': 'পবিত্র রুপো',
    'of Tripura': 'ত্রিপুরার',
    'The iconic silver torque and coin necklace you see here is not merely ornament — it is cultural identity. Passed down through generations, these pieces are worn during festivals, ceremonies, and sacred rituals by Tripuri women.':
      'এখানে যে আইকনিক রুপোর টর্ক ও মুদ্রার হার দেখছেন তা কেবল অলংকার নয় — এটি সাংস্কৃতিক পরিচয়। প্রজন্ম থেকে প্রজন্মে হস্তান্তরিত এই অলংকার ত্রিপুরি নারীরা উৎসব, অনুষ্ঠান ও পবিত্র আচারে পরেন।',
    'Hand-hammered from pure 92.5 silver by master artisans': 'দক্ষ কারিগরদের হাতে খাঁটি ৯২.৫ রুপো পিটিয়ে তৈরি',
    'Traditional crescent torque — symbol of feminine grace': 'ঐতিহ্যবাহী অর্ধচন্দ্রাকার টর্ক — নারীসৌন্দর্যের প্রতীক',
    'Coin pendants hand-engraved with ancestral motifs': 'পূর্বপুরুষের নকশায় হাতে খোদাই করা মুদ্রার পেন্ডেন্ট',
    'Ethically sourced, community-supported craftsmanship': 'নৈতিকভাবে সংগৃহীত, সম্প্রদায়-সমর্থিত কারুশিল্প',
    'Each piece comes with a certificate of authenticity': 'প্রতিটি পণ্যের সঙ্গে থাকে সত্যতার শংসাপত্র',
    'DISCOVER JEWELRY →': 'গয়না আবিষ্কার করুন →',
    'Handloom Weaving': 'হস্তচালিত তাঁত বুনন',
    'Every fabric woven on traditional pit looms using time-honoured techniques passed from mother to daughter for over a thousand years.':
      'প্রতিটি বস্ত্র ঐতিহ্যবাহী পিট লুমে বোনা, হাজার বছরেরও বেশি সময় ধরে মা থেকে মেয়েতে চলে আসা সুপ্রাচীন কৌশলে।',
    'Silver Smithing': 'রৌপ্যশিল্প',
    'Artisan silversmiths forge each ornament by hand — torques, earrings, and coin necklaces shaped with ancestral tools and sacred intent.':
      'কারিগর রৌপ্যকাররা প্রতিটি অলংকার হাতে গড়েন — পূর্বপুরুষের যন্ত্র ও পবিত্র মনোভাবে গড়া টর্ক, কানের দুল ও মুদ্রার হার।',
    'Community First': 'সম্প্রদায় প্রথমে',
    "Every purchase directly supports indigenous artisan families across Tripura's hills, preserving their livelihood and cultural identity.":
      'প্রতিটি কেনাকাটা সরাসরি ত্রিপুরার পাহাড়জুড়ে আদিবাসী কারিগর পরিবারগুলিকে সহায়তা করে, তাদের জীবিকা ও সাংস্কৃতিক পরিচয় রক্ষা করে।',
    '✦ FOUNDER': '✦ প্রতিষ্ঠাতা',
    'Founder & Curator, Mwktai': 'প্রতিষ্ঠাতা ও কিউরেটর, মৃকতাই',
    "I'm from Tripura. Growing up, I saw artisans who had mastered crafts that took generations to perfect — and yet struggled to find buyers beyond their village. The skill was extraordinary. The reach was not. Mwktai is my attempt to close that gap — to make sure the hands that create these things are the ones who benefit most from them.":
      'আমি ত্রিপুরার মানুষ। বড় হওয়ার সময় দেখেছি, যে কারিগররা প্রজন্মের সাধনায় নিখুঁত হওয়া শিল্পে দক্ষ — তবুও তাঁরা গ্রামের বাইরে ক্রেতা খুঁজে পেতে সংগ্রাম করেন। দক্ষতা ছিল অসাধারণ, পরিসর ছিল না। মৃকতাই সেই ব্যবধান ঘোচানোর আমার প্রয়াস — যাতে যে হাত এসব সৃষ্টি করে, সেই হাতই সবচেয়ে বেশি উপকৃত হয়।',
    '✦ CO-FOUNDER': '✦ সহ-প্রতিষ্ঠাতা',
    'Co-Founder, Mwktai': 'সহ-প্রতিষ্ঠাতা, মৃকতাই',
    "I believe that the soul of Tripura lies in the rhythm of the loom and the whisper of bamboo groves. Our vision is to transform the indigenous artistry of our nineteen tribes from a local treasure into a global lifestyle. We are not just selling products — we are preserving a heartbeat. Every weave and every carving is a piece of Tripura's history, remembering our home.":
      'আমি বিশ্বাস করি ত্রিপুরার আত্মা লুকিয়ে আছে তাঁতের ছন্দে আর বাঁশবনের ফিসফিসানিতে। আমাদের স্বপ্ন আমাদের ঊনিশটি জনজাতির আদিবাসী শিল্পকলাকে স্থানীয় সম্পদ থেকে বিশ্বজনীন জীবনধারায় রূপান্তরিত করা। আমরা কেবল পণ্য বিক্রি করছি না — আমরা একটি হৃৎস্পন্দন রক্ষা করছি। প্রতিটি বুনন ও খোদাই ত্রিপুরার ইতিহাসের এক টুকরো, আমাদের ঘরকে স্মরণ করায়।',
    '✦ THE VISION ✦': '✦ দৃষ্টিভঙ্গি ✦',
    "We don't just sell cloth.": 'আমরা শুধু কাপড় বিক্রি করি না।',
    'We sell memory.': 'আমরা স্মৃতি বিক্রি করি।',
    "Tripura's weavers have spent a thousand years perfecting the language of thread — colours that tell tribal stories, patterns that encode festivals, silver that marks rites of passage. Mwktai exists so that language is never forgotten.":
      'ত্রিপুরার তাঁতিরা হাজার বছর ধরে সুতোর ভাষা নিখুঁত করেছেন — যে রং জনজাতির গল্প বলে, যে নকশা উৎসবকে ধারণ করে, যে রুপো জীবনের পর্বকে চিহ্নিত করে। মৃকতাই আছে যাতে সেই ভাষা কখনও বিস্মৃত না হয়।',
    'Our mission is simple and non-negotiable: every artisan gets a fair price, every tradition gets a future, and every customer gets something genuinely irreplaceable — not a product manufactured in a factory, but a piece of someone’s heritage, made by hand, with intent.':
      'আমাদের লক্ষ্য সহজ ও আপসহীন: প্রতিটি কারিগর ন্যায্য মূল্য পান, প্রতিটি ঐতিহ্য ভবিষ্যৎ পায়, এবং প্রতিটি ক্রেতা সত্যিকারের অপ্রতিস্থাপ্য কিছু পান — কারখানায় তৈরি পণ্য নয়, বরং কারও ঐতিহ্যের এক টুকরো, হাতে তৈরি, যত্নে গড়া।',
    '"The loom does not forget what the world forgets."': '"পৃথিবী যা ভুলে যায়, তাঁত তা ভোলে না।"',
    'SUPPORT': 'সহায়তা',
    'Help & FAQs': 'সহায়তা ও সাধারণ প্রশ্ন',
    'How long does delivery take?': 'ডেলিভারিতে কত সময় লাগে?',
    "Orders are typically dispatched within 2–3 business days from Tripura. Delivery across India takes 5–8 business days. You'll receive a tracking link via email and WhatsApp once shipped.":
      'অর্ডার সাধারণত ত্রিপুরা থেকে ২–৩ কর্মদিবসের মধ্যে পাঠানো হয়। সারা ভারতে ডেলিভারিতে ৫–৮ কর্মদিবস লাগে। পণ্য পাঠানো হলে আপনি ইমেল ও হোয়াটসঅ্যাপে একটি ট্র্যাকিং লিঙ্ক পাবেন।',
    'Are the products genuinely handmade?': 'পণ্যগুলি কি সত্যিই হাতে তৈরি?',
    "Every product is handcrafted by indigenous artisans from Tripura's tribal communities. Each piece comes with a certificate of authenticity stating the artisan community and craft technique.":
      'প্রতিটি পণ্য ত্রিপুরার জনজাতি সম্প্রদায়ের আদিবাসী কারিগরদের হাতে তৈরি। প্রতিটি পণ্যের সঙ্গে থাকে সত্যতার শংসাপত্র, যেখানে কারিগর সম্প্রদায় ও শিল্পকৌশলের উল্লেখ থাকে।',
    'What is the return & exchange policy?': 'ফেরত ও বিনিময় নীতি কী?',
    'We accept returns within 7 days of delivery if the item is unused and in original condition. Exchanges are processed within 5 business days. Contact us via WhatsApp or email to initiate a return.':
      'পণ্য অব্যবহৃত ও আসল অবস্থায় থাকলে ডেলিভারির ৭ দিনের মধ্যে আমরা ফেরত গ্রহণ করি। বিনিময় ৫ কর্মদিবসের মধ্যে সম্পন্ন হয়। ফেরত শুরু করতে হোয়াটসঅ্যাপ বা ইমেলে যোগাযোগ করুন।',
    'Can I place a custom or bulk order?': 'আমি কি কাস্টম বা বাল্ক অর্ডার দিতে পারি?',
    "Yes! We welcome custom orders for weddings, corporate gifting, and bulk purchases. Please reach out via WhatsApp or email with your requirements and we'll get back within 24 hours.":
      'হ্যাঁ! বিবাহ, কর্পোরেট উপহার ও বাল্ক কেনাকাটার জন্য আমরা কাস্টম অর্ডার স্বাগত জানাই। আপনার প্রয়োজন জানিয়ে হোয়াটসঅ্যাপ বা ইমেলে যোগাযোগ করুন, আমরা ২৪ ঘণ্টার মধ্যে সাড়া দেব।',
    'Which payment methods are accepted?': 'কোন কোন পেমেন্ট পদ্ধতি গ্রহণ করা হয়?',
    "We accept all major UPI apps (GPay, PhonePe, Paytm), credit/debit cards, and net banking via Razorpay — India's most trusted payment gateway. All transactions are fully secure.":
      'আমরা সব প্রধান ইউপিআই অ্যাপ (জিপে, ফোনপে, পেটিএম), ক্রেডিট/ডেবিট কার্ড এবং Razorpay-এর মাধ্যমে নেট ব্যাঙ্কিং গ্রহণ করি — ভারতের সবচেয়ে বিশ্বস্ত পেমেন্ট গেটওয়ে। সব লেনদেন সম্পূর্ণ সুরক্ষিত।',
    'GET IN TOUCH': 'যোগাযোগ করুন',
    'Contact Us': 'যোগাযোগ করুন',
    "We're a small team in Tripura — your message will always reach a real person.":
      'আমরা ত্রিপুরার একটি ছোট দল — আপনার বার্তা সর্বদা একজন প্রকৃত মানুষের কাছে পৌঁছাবে।',
    'WhatsApp / Phone': 'হোয়াটসঅ্যাপ / ফোন',
    'CHAT ON WHATSAPP': 'হোয়াটসঅ্যাপে চ্যাট করুন',
    'Email': 'ইমেল',
    'SEND EMAIL': 'ইমেল পাঠান',
    'Location': 'অবস্থান',
    'Agartala, Tripura': 'আগরতলা, ত্রিপুরা',
    'Northeast India — 799 001': 'উত্তর-পূর্ব ভারত — ৭৯৯ ০০১',
    'Working Hours': 'কাজের সময়',
    'Monday – Saturday': 'সোমবার – শনিবার',
    '10:00 AM – 6:00 PM IST': 'সকাল ১০:০০ – সন্ধ্যা ৬:০০ (ভারতীয় সময়)',
    'Track Your Order': 'আপনার অর্ডার ট্র্যাক করুন',
    'Enter your email to track orders': 'অর্ডার ট্র্যাক করতে আপনার ইমেল লিখুন',
    'TRACK ORDER': 'অর্ডার ট্র্যাক করুন',
    'WOVEN WITH HERITAGE · ADORNED WITH TRADITION · MADE WITH LOVE':
      'ঐতিহ্যে বোনা · পরম্পরায় সাজানো · ভালোবাসায় তৈরি',
    "Women's Wear": 'নারীদের পোশাক',
    "Men's Wear": 'পুরুষদের পোশাক',
    '© 2025 MWKTAI · ALL RIGHTS RESERVED': '© ২০২৫ মৃকতাই · সর্বস্বত্ব সংরক্ষিত',
    "Women's Heritage Wear": 'নারীদের ঐতিহ্যবাহী পোশাক',
    "Men's Heritage Wear": 'পুরুষদের ঐতিহ্যবাহী পোশাক',
    'Tribal Silver Jewellery': 'জনজাতীয় রুপোর গয়না',
    'Bamboo Home Décor': 'বাঁশের গৃহসজ্জা',
    'Traditional Tripura Silver Jewelry': 'ঐতিহ্যবাহী ত্রিপুরা রুপোর গয়না',

    // ── Women's Wear page ──
    "Women's Wear — Mwktai": 'নারীদের পোশাক — মৃকতাই',
    '← HOME': '← হোম',
    '✦ Indigenous Handloom ✦': '✦ আদিবাসী হস্তচালিত তাঁত ✦',
    'Six tribes. Six distinct weaving traditions.': 'ছয়টি জনজাতি। ছয়টি স্বতন্ত্র বুনন ঐতিহ্য।',
    'Each thread a story passed from mother to daughter.': 'প্রতিটি সুতো মা থেকে মেয়েতে চলে আসা এক গল্প।',
    'Tripuri Collection': 'ত্রিপুরি সংগ্রহ',
    'Risa Royale': 'রিসা রয়্যাল',
    'The original. The iconic. Two thousand years on the loom.':
      'আদি। আইকনিক। দুই হাজার বছর ধরে তাঁতে।',
    'SHOP THIS →': 'এটি দেখুন →',
    'Reang Collection': 'রিয়াং সংগ্রহ',
    'Stripe & Soul': 'ডোরা ও আত্মা',
    'Bold stripes, ancient stories woven thread by thread.':
      'সাহসী ডোরা, সুতোয় সুতোয় বোনা প্রাচীন গল্প।',
    'Chakma Collection': 'চাকমা সংগ্রহ',
    'Pinon Poetry': 'পিনন কাব্য',
    'Where geometry meets grace.': 'যেখানে জ্যামিতি মেলে সৌন্দর্যের সঙ্গে।',
    'Jamatia Collection': 'জামাতিয়া সংগ্রহ',
    'Waichum Whispers': 'ওয়াইচুম ফিসফিসানি',
    'Quiet elegance. Roots that run deep.': 'নিঃশব্দ লাবণ্য। গভীরে প্রোথিত শিকড়।',
    'Mog Collection': 'মগ সংগ্রহ',
    'Sacred Threads': 'পবিত্র সুতো',
    'Woven with devotion, worn with pride.': 'ভক্তিতে বোনা, গর্বে পরা।',
    'Multi-Tribe': 'বহু-জনজাতি',
    'The Hill Collective': 'পাহাড়ি সমাহার',
    'Many tribes. One living tradition.': 'বহু জনজাতি। একটি জীবন্ত ঐতিহ্য।',
    '✦ Place Your Order ✦': '✦ আপনার অর্ডার দিন ✦',
    'Your Name': 'আপনার নাম',
    'Phone Number': 'ফোন নম্বর',
    'Email (for order updates)': 'ইমেল (অর্ডার আপডেটের জন্য)',
    'Delivery Address': 'ডেলিভারি ঠিকানা',
    'Secure payment by Razorpay.': 'Razorpay-এর মাধ্যমে নিরাপদ পেমেন্ট।',
    'Free shipping across India.': 'সারা ভারতে বিনামূল্যে ডেলিভারি।',
    'Order Placed!': 'অর্ডার সম্পন্ন হয়েছে!',
    "Thank you. We've received your order and will reach out to confirm delivery details shortly.":
      'ধন্যবাদ। আমরা আপনার অর্ডার পেয়েছি এবং শীঘ্রই ডেলিভারির বিবরণ নিশ্চিত করতে যোগাযোগ করব।',
    'Full name': 'পুরো নাম',
    '10-digit mobile number': '১০ সংখ্যার মোবাইল নম্বর',
    'House, Street, City, PIN': 'বাড়ি, রাস্তা, শহর, পিন',
    'Risa Royale — Tripuri Collection': 'রিসা রয়্যাল — ত্রিপুরি সংগ্রহ',
    'Stripe & Soul — Reang Collection': 'ডোরা ও আত্মা — রিয়াং সংগ্রহ',
    'Pinon Poetry — Chakma Collection': 'পিনন কাব্য — চাকমা সংগ্রহ',
    'Waichum Whispers — Jamatia Collection': 'ওয়াইচুম ফিসফিসানি — জামাতিয়া সংগ্রহ',
    'Sacred Threads — Mog Collection': 'পবিত্র সুতো — মগ সংগ্রহ',
    'The Hill Collective — Multi-Tribe': 'পাহাড়ি সমাহার — বহু-জনজাতি',

    // ── Men's Wear page ──
    "Men's Wear — Mwktai": 'পুরুষদের পোশাক — মৃকতাই',
    "From the Kubai to the Kamsoi — traditional attire worn by the men of Tripura's tribal communities, woven with purpose and pride.":
      'কুবাই থেকে কামসোই — ত্রিপুরার জনজাতি সম্প্রদায়ের পুরুষদের পরা ঐতিহ্যবাহী পোশাক, উদ্দেশ্য ও গর্বে বোনা।',
    'Kubai': 'কুবাই',
    'The sacred handwoven shirt of the Tripuri man — crimson and gold stripes carrying the weight of ancestry.':
      'ত্রিপুরি পুরুষের পবিত্র হস্তবোনা জামা — লাল ও সোনালি ডোরায় বহন করে পূর্বপুরুষের ভার।',
    'Kamsoi': 'কামসোই',
    "Bold, geometric weaves in deep earth tones — the Reang man's mark of identity and strength.":
      'গভীর মাটির রঙে সাহসী জ্যামিতিক বুনন — রিয়াং পুরুষের পরিচয় ও শক্তির চিহ্ন।',
    'Jummosulum': 'জুম্মোসুলুম',
    'Intricate geometric patterns woven in silk-like cotton — the Chakma tradition of quiet, precise artistry.':
      'রেশমসদৃশ সুতিতে বোনা জটিল জ্যামিতিক নকশা — নিঃশব্দ, নিখুঁত শিল্পকলার চাকমা ঐতিহ্য।',
    'Tuti': 'তুতি',
    'Worn during ceremony and celebration — the Tuti embodies the Jamatia spirit of community and reverence.':
      'অনুষ্ঠান ও উৎসবে পরা — তুতি জামাতিয়া সম্প্রদায়ের ঐক্য ও শ্রদ্ধার চেতনা ধারণ করে।',
    '✦ More collections coming soon ✦': '✦ আরও সংগ্রহ শীঘ্রই আসছে ✦',
    "Kubai — Tripuri Men's Attire": 'কুবাই — ত্রিপুরি পুরুষদের পোশাক',
    "Kamsoi — Reang Men's Attire": 'কামসোই — রিয়াং পুরুষদের পোশাক',
    "Jummosulum — Chakma Men's Attire": 'জুম্মোসুলুম — চাকমা পুরুষদের পোশাক',
    "Tuti — Jamatia Men's Attire": 'তুতি — জামাতিয়া পুরুষদের পোশাক',

    // ── Jewellery / Home Décor pages ──
    'Jewellery — Mwktai': 'গয়না — মৃকতাই',
    '✦ Artisan Silver ✦': '✦ কারিগরি রুপো ✦',
    'Hand-hammered silver torques, Mwktai necklaces and tribal earrings — forged by master silversmiths of Tripura.':
      'হাতে-পেটানো রুপোর টর্ক, মৃকতাই হার ও জনজাতীয় কানের দুল — ত্রিপুরার দক্ষ রৌপ্যকারদের হাতে গড়া।',
    'Loading our collection…': 'আমাদের সংগ্রহ লোড হচ্ছে…',
    'Home Décor — Mwktai': 'গৃহসজ্জা — মৃকতাই',
    '✦ Bamboo & Cane ✦': '✦ বাঁশ ও বেত ✦',
    'Handcrafted bamboo lamps, cane baskets and tribal textiles — the living forest of Tripura, transformed by artisan hands.':
      'হাতে তৈরি বাঁশের বাতি, বেতের ঝুড়ি ও জনজাতীয় বস্ত্র — ত্রিপুরার জীবন্ত অরণ্য, কারিগরের হাতে রূপান্তরিত।',

    // ── Contact page ──
    'Contact Us — Mwktai': 'যোগাযোগ করুন — মৃকতাই',
    'Mon – Sat, 10 AM – 6 PM IST': 'সোম – শনি, সকাল ১০টা – সন্ধ্যা ৬টা (ভারতীয় সময়)',
    'We reply within 24 hours': 'আমরা ২৪ ঘণ্টার মধ্যে উত্তর দিই',
    'Closed on Sundays and national holidays': 'রবিবার ও জাতীয় ছুটির দিনে বন্ধ',
    'Share your order ID via WhatsApp': 'হোয়াটসঅ্যাপে আপনার অর্ডার আইডি জানান',
    "We'll update you within the hour": 'আমরা এক ঘণ্টার মধ্যে আপনাকে জানাব',

    // ── Help page ──
    'Help & FAQs — Mwktai': 'সহায়তা ও সাধারণ প্রশ্ন — মৃকতাই',
    'Everything you need to know about ordering, delivery and our products.':
      'অর্ডার, ডেলিভারি ও আমাদের পণ্য সম্পর্কে যা যা জানা দরকার।',
    "Orders are typically dispatched within 2–3 business days from Agartala, Tripura. Delivery across India takes 5–8 business days. You'll receive a tracking link via email and WhatsApp as soon as your order ships.":
      'অর্ডার সাধারণত আগরতলা, ত্রিপুরা থেকে ২–৩ কর্মদিবসের মধ্যে পাঠানো হয়। সারা ভারতে ডেলিভারিতে ৫–৮ কর্মদিবস লাগে। অর্ডার পাঠানোর সঙ্গে সঙ্গে আপনি ইমেল ও হোয়াটসঅ্যাপে একটি ট্র্যাকিং লিঙ্ক পাবেন।',
    "Every product is handcrafted by indigenous artisans from Tripura's tribal communities — Tripuri, Reang, Chakma, Jamatia, and Mog. Each piece comes with a certificate of authenticity stating the artisan community and craft technique used.":
      'প্রতিটি পণ্য ত্রিপুরার জনজাতি সম্প্রদায়ের আদিবাসী কারিগরদের হাতে তৈরি — ত্রিপুরি, রিয়াং, চাকমা, জামাতিয়া ও মগ। প্রতিটি পণ্যের সঙ্গে থাকে সত্যতার শংসাপত্র, যেখানে ব্যবহৃত কারিগর সম্প্রদায় ও শিল্পকৌশলের উল্লেখ থাকে।',
    "We accept returns within 7 days of delivery if the item is unused and in its original condition. Exchanges are processed within 5 business days. Contact us via WhatsApp or email with your order ID to initiate a return — we'll handle everything smoothly.":
      'পণ্য অব্যবহৃত ও আসল অবস্থায় থাকলে ডেলিভারির ৭ দিনের মধ্যে আমরা ফেরত গ্রহণ করি। বিনিময় ৫ কর্মদিবসের মধ্যে সম্পন্ন হয়। ফেরত শুরু করতে আপনার অর্ডার আইডি জানিয়ে হোয়াটসঅ্যাপ বা ইমেলে যোগাযোগ করুন — আমরা সবকিছু সুষ্ঠুভাবে সামলাব।',
    "Absolutely! We welcome custom orders for weddings, corporate gifting, NGO support programmes, and bulk purchases. Reach out via WhatsApp or email with your requirements and we'll respond within 24 hours with a personalised quote.":
      'অবশ্যই! বিবাহ, কর্পোরেট উপহার, এনজিও সহায়তা কর্মসূচি ও বাল্ক কেনাকাটার জন্য আমরা কাস্টম অর্ডার স্বাগত জানাই। আপনার প্রয়োজন জানিয়ে হোয়াটসঅ্যাপ বা ইমেলে যোগাযোগ করুন, আমরা ২৪ ঘণ্টার মধ্যে একটি ব্যক্তিগত দরপত্র সহ সাড়া দেব।',
    "We accept all major UPI apps (GPay, PhonePe, Paytm), credit and debit cards, and net banking via Razorpay — India's most trusted payment gateway. All transactions are fully encrypted and secure.":
      'আমরা সব প্রধান ইউপিআই অ্যাপ (জিপে, ফোনপে, পেটিএম), ক্রেডিট ও ডেবিট কার্ড এবং Razorpay-এর মাধ্যমে নেট ব্যাঙ্কিং গ্রহণ করি — ভারতের সবচেয়ে বিশ্বস্ত পেমেন্ট গেটওয়ে। সব লেনদেন সম্পূর্ণ এনক্রিপ্টেড ও সুরক্ষিত।',
    'Do you ship internationally?': 'আপনারা কি আন্তর্জাতিকভাবে পণ্য পাঠান?',
    "International shipping is currently in the works. We expect to launch global delivery within the next few months. In the meantime, if you're based outside India and would like to order, please contact us directly and we'll find a way.":
      'আন্তর্জাতিক ডেলিভারি বর্তমানে প্রক্রিয়াধীন। আগামী কয়েক মাসের মধ্যে আমরা বিশ্বজুড়ে ডেলিভারি চালু করার আশা করছি। ইতিমধ্যে, আপনি ভারতের বাইরে থাকলে এবং অর্ডার করতে চাইলে সরাসরি আমাদের সঙ্গে যোগাযোগ করুন, আমরা একটি উপায় বের করব।',
    'How do I care for handwoven fabrics?': 'হস্তবোনা কাপড়ের যত্ন কীভাবে নেব?',
    'Handwoven fabrics should be hand-washed in cold water with a mild detergent. Avoid wringing — gently press out excess water and dry in shade. For silver jewellery, store in a dry cloth pouch and wipe with a soft cloth after wearing. Each order includes a care card.':
      'হস্তবোনা কাপড় ঠান্ডা জলে মৃদু ডিটারজেন্ট দিয়ে হাতে ধোয়া উচিত। নিংড়াবেন না — আলতো করে অতিরিক্ত জল চেপে বের করে ছায়ায় শুকান। রুপোর গয়না শুকনো কাপড়ের থলিতে রাখুন এবং পরার পর নরম কাপড় দিয়ে মুছুন। প্রতিটি অর্ডারে একটি যত্ন-কার্ড থাকে।',
    "Still have a question? We're one message away.": 'এখনও প্রশ্ন আছে? আমরা মাত্র একটি বার্তা দূরে।',
    'CONTACT US': 'যোগাযোগ করুন',

    // ── Track Order page ──
    'Track Order — Mwktai': 'অর্ডার ট্র্যাক — মৃকতাই',
    'ORDER STATUS': 'অর্ডারের অবস্থা',
    "Order tracking is coming soon. For now, contact us via WhatsApp or email with your order ID and we'll update you within the hour.":
      'অর্ডার ট্র্যাকিং শীঘ্রই আসছে। আপাতত, আপনার অর্ডার আইডি জানিয়ে হোয়াটসঅ্যাপ বা ইমেলে যোগাযোগ করুন, আমরা এক ঘণ্টার মধ্যে আপনাকে জানাব।',
    'CONTACT US FOR STATUS': 'অবস্থা জানতে যোগাযোগ করুন',
  };

  // ── Public API ────────────────────────────────────────────────────────────
  function addTranslations(map) {
    if (!map) return;
    Object.keys(map).forEach(function (k) {
      if (k && map[k]) DICT[norm(k)] = map[k];
    });
    apply();
  }

  // ── DOM translation ───────────────────────────────────────────────────────
  let observer = null;

  function translateAttrs(el) {
    ['placeholder', 'title', 'alt', 'aria-label'].forEach(function (attr) {
      if (el.hasAttribute && el.hasAttribute(attr)) {
        const v = norm(el.getAttribute(attr));
        if (DICT[v]) el.setAttribute(attr, DICT[v]);
      }
    });
  }

  function apply() {
    if (LANG !== 'bn') return;
    if (observer) observer.disconnect();

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
      const key = norm(raw);
      if (DICT[key]) {
        const lead = raw.match(/^\s*/)[0];
        const tail = raw.match(/\s*$/)[0];
        node.nodeValue = lead + DICT[key] + tail;
      }
    });

    document.body.querySelectorAll('input,textarea,img,[title],[aria-label]').forEach(translateAttrs);

    if (observer) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // ── Bengali font ──────────────────────────────────────────────────────────
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
