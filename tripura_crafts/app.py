# app.py — Tripura Craftsmen
import os
import re
import streamlit as st

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Tripura Craftsmen — Heritage Collection",
    page_icon="🎋",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ── Paths ─────────────────────────────────────────────────────────────────────
_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Session state ─────────────────────────────────────────────────────────────
def _ss(k, v):
    if k not in st.session_state:
        st.session_state[k] = v

_ss("page", "home")
_ss("cart", {})
_ss("womens_collection", None)

# ── Query param routing ────────────────────────────────────────────────────────
_NAV_MAP = {
    "womens_wear": "womens_wear",
    "mens_wear":   "mens_wear",
    "jewellery":   "jewellery",
    "home_decor":  "home_decor",
    "contact":     "contact",
    "help":        "help",
    "track_order": "track_order",
}

_nav = st.query_params.get("nav", "")
if _nav in _NAV_MAP and st.session_state.page == "home":
    st.session_state.page = _NAV_MAP[_nav]
    st.query_params.clear()
    st.rerun()

# ── Navigation helper ──────────────────────────────────────────────────────────
def nav_to(page):
    st.session_state.page = page
    st.rerun()

# ── CSS — hides Streamlit chrome on home page ──────────────────────────────────
_HOME_CSS = """
<style>
  #MainMenu, header, footer { display: none !important; }
  .block-container { padding: 0 !important; max-width: 100% !important; }
  section[data-testid="stSidebar"] { display: none !important; }
  [data-testid="stAppViewContainer"] { padding: 0 !important; }
</style>
"""

# ── CSS — minimal chrome for inner pages ──────────────────────────────────────
_PAGE_CSS = """
<style>
  #MainMenu, header, footer { display: none !important; }
  .block-container { padding: 2rem 3rem !important; max-width: 1000px !important; margin: 0 auto !important; }
  section[data-testid="stSidebar"] { display: none !important; }
</style>
"""

# ── Home page CSS (kept for reference — now unused since HTML is served as static file) ──
_HOME_PAGE_CSS_UNUSED = """
<style>
/* This block is no longer used — the HTML landing page is served at
   /app/static/landing_page.html and embedded via an unsandboxed iframe. */
.home-hero {
    background: linear-gradient(160deg, #1A0A00 0%, #3d1500 50%, #1A0A00 100%);
    text-align: center;
    padding: 90px 24px 80px;
    border-bottom: 1px solid rgba(200,151,42,0.2);
}
.home-eyebrow {
    font-family: 'Cinzel', serif;
    font-size: 0.65rem;
    letter-spacing: 0.4em;
    color: #C8972A;
    text-transform: uppercase;
    margin-bottom: 20px;
}
.home-title {
    font-family: 'Playfair Display', serif;
    font-size: clamp(2.2rem, 6vw, 4rem);
    color: #FAF3E8;
    font-weight: 700;
    line-height: 1.2;
    margin-bottom: 20px;
}
.home-title em { font-style: italic; color: #C8972A; }
.home-subtitle {
    font-family: 'Cormorant Garamond', serif;
    font-size: clamp(1rem, 2vw, 1.2rem);
    color: rgba(250,243,232,0.6);
    max-width: 560px;
    margin: 0 auto 40px;
    line-height: 1.8;
}
.home-divider {
    width: 80px; height: 1px;
    background: linear-gradient(90deg, transparent, #C8972A, transparent);
    margin: 0 auto;
}

/* Section headings */
.section-label {
    font-family: 'Cinzel', serif;
    font-size: 0.6rem;
    letter-spacing: 0.4em;
    color: #C8972A;
    text-transform: uppercase;
    text-align: center;
    margin: 40px 0 10px;
}
.section-title {
    font-family: 'Playfair Display', serif;
    font-size: clamp(1.6rem, 3vw, 2.4rem);
    color: #FAF3E8;
    text-align: center;
    margin-bottom: 32px;
}

/* Cards */
.home-card {
    border-radius: 8px;
    overflow: hidden;
    background: #2a1200;
    border: 1px solid rgba(200,151,42,0.15);
    transition: transform 0.3s ease, border-color 0.3s ease;
    margin-bottom: 12px;
}
.home-card:hover {
    transform: translateY(-6px);
    border-color: rgba(200,151,42,0.5);
}
.home-card img {
    width: 100%;
    aspect-ratio: 3/4;
    object-fit: cover;
    display: block;
}
.home-card-placeholder {
    width: 100%;
    aspect-ratio: 3/4;
    background: linear-gradient(160deg, #2a1200 0%, #4a2000 100%);
    display: flex;
    align-items: center;
    justify-content: center;
}
.home-card-body { padding: 16px; }
.home-card-label {
    font-family: 'Cinzel', serif;
    font-size: 0.52rem;
    letter-spacing: 0.28em;
    color: #C8972A;
    text-transform: uppercase;
    margin-bottom: 6px;
}
.home-card-name {
    font-family: 'Playfair Display', serif;
    font-size: 1.15rem;
    color: #FAF3E8;
    margin-bottom: 6px;
}
.home-card-desc {
    font-family: 'Cormorant Garamond', serif;
    font-size: 0.88rem;
    color: rgba(250,243,232,0.5);
    line-height: 1.6;
}

/* Explore buttons */
.stButton > button {
    background: transparent !important;
    border: 1px solid #C8972A !important;
    color: #C8972A !important;
    font-family: 'Cinzel', serif !important;
    font-size: 0.63rem !important;
    letter-spacing: 0.22em !important;
    padding: 10px 24px !important;
    border-radius: 2px !important;
    width: 100% !important;
    transition: all 0.3s !important;
}
.stButton > button:hover {
    background: #C8972A !important;
    color: #1A0A00 !important;
}

/* Footer */
.home-footer {
    text-align: center;
    padding: 40px 20px 30px;
    border-top: 1px solid rgba(200,151,42,0.15);
    margin-top: 48px;
}
.home-footer-brand {
    font-family: 'Playfair Display', serif;
    font-size: 1.6rem;
    color: #FAF3E8;
    margin-bottom: 10px;
}
.home-footer-tag {
    font-family: 'Cinzel', serif;
    font-size: 0.52rem;
    letter-spacing: 0.28em;
    color: rgba(250,243,232,0.3);
}
</style>
"""

# ═══════════════════════════════════════════════════════════════════════════════
#  HOME PAGE
#  Strategy: read the HTML file in Python, process it (fix nav links, image
#  paths, remove JS), then inject CSS + body separately via st.markdown.
#  Navigation uses plain <a href="/?nav=xxx"> links — no JS needed.
#  The query-param router at the top of this file handles the routing.
# ═══════════════════════════════════════════════════════════════════════════════
@st.cache_data(show_spinner=False)
def _get_home_html():
    html_path = os.path.join(_DIR, "tripuracraftsmen_showcase.html")
    with open(html_path, "r", encoding="utf-8") as f:
        raw = f.read()

    # ── Extract and merge all <style> blocks ──────────────────────────────────
    styles = re.findall(r"<style[^>]*>(.*?)</style>", raw, re.DOTALL)
    extra_css = """
    /* Make scroll-reveal elements visible (IntersectionObserver won't run) */
    .reveal { opacity: 1 !important; transform: none !important;
              animation: fadeUp 0.7s ease both !important; }
    /* Show all FAQ answers (toggleFaq JS won't run) */
    .faq-answer { max-height: 600px !important; padding-top: 14px !important;
                  overflow: visible !important; }
    .faq-arrow { display: none !important; }
    .faq-item  { cursor: default !important; }
    """
    css = "<style>" + "\n".join(styles) + extra_css + "</style>"

    # ── Extract <body> content ────────────────────────────────────────────────
    m = re.search(r"<body[^>]*>(.*?)</body>", raw, re.DOTALL)
    body = m.group(1) if m else raw

    # Remove <script> blocks (they don't execute inside st.markdown anyway)
    body = re.sub(r"<script[^>]*>.*?</script>", "", body, flags=re.DOTALL)

    # Convert  onclick="navigateTo('page')"  →  href="/?nav=page"
    body = re.sub(r'onclick="navigateTo\(\'(\w+)\'\)"', r'href="/?nav=\1"', body)

    # Remove FAQ onclick (answers are always-visible via CSS override above)
    body = body.replace(' onclick="toggleFaq(this)"', "")

    # Fix image paths → Streamlit static file server
    for img in ["women_wear.jpg", "men_wear.jpg", "jewellery.jpg",
                "home_decor.jpg", "sacred_silver.jpg"]:
        body = body.replace(f'src="{img}"', f'src="/app/static/{img}"')

    # CRITICAL: collapse multiple blank lines so Python-markdown doesn't break
    # HTML blocks at blank-line boundaries
    body = re.sub(r"\n{2,}", "\n", body)

    return css, body


def render_home():
    # Hide all Streamlit chrome for a full-bleed experience
    st.markdown("""<style>
      #MainMenu, header, footer { display: none !important; }
      .block-container { padding: 0 !important; max-width: 100% !important; }
      section[data-testid="stSidebar"] { display: none !important; }
      [data-testid="stAppViewContainer"] { padding: 0 !important; }
    </style>""", unsafe_allow_html=True)

    css, body = _get_home_html()
    st.markdown(css,  unsafe_allow_html=True)   # inject all page CSS
    st.markdown(body, unsafe_allow_html=True)   # inject page body HTML


# ═══════════════════════════════════════════════════════════════════════════════
#  PLACEHOLDER FOR COMING-SOON PAGES
# ═══════════════════════════════════════════════════════════════════════════════
def _placeholder(title, icon, tagline):
    st.markdown(_PAGE_CSS, unsafe_allow_html=True)
    st.markdown(f"""
    <div style="text-align:center; padding: 80px 20px 48px;">
      <div style="font-size:3.5rem; margin-bottom:20px;">{icon}</div>
      <h1 style="font-family:'Georgia',serif; font-size:2.4rem; color:#1A0A00;
          font-weight:600; margin-bottom:14px;">{title}</h1>
      <p style="color:#888; font-size:1.05rem; line-height:1.8; max-width:480px; margin:0 auto;">
        {tagline}
      </p>
      <div style="margin-top:12px; display:inline-block; width:60px; height:2px;
          background:linear-gradient(90deg,#C8972A,#D4AF37);"></div>
    </div>
    """, unsafe_allow_html=True)
    col = st.columns([2, 1, 2])[1]
    with col:
        if st.button("← Back to Home", use_container_width=True):
            nav_to("home")


# ═══════════════════════════════════════════════════════════════════════════════
#  WOMEN'S WEAR — 6 collection cards
# ═══════════════════════════════════════════════════════════════════════════════
COLLECTIONS = [
    {
        "key":     "risa_royale",
        "name":    "Risa Royale",
        "tribe":   "Tripuri Collection",
        "tagline": "The original. The iconic. Two thousand years on the loom.",
        "items":   ["Risa Set", "Rignai Wrap", "Pachra Drape", "Festive Risa", "Bridal Rignai", "Everyday Set"],
    },
    {
        "key":     "stripe_soul",
        "name":    "Stripe & Soul",
        "tribe":   "Reang Collection",
        "tagline": "Bold stripes, ancient stories woven thread by thread.",
        "items":   ["Rina Stripe", "Risha Weave", "Festive Rina", "Daily Risha", "Bridal Set", "Stripe Dupatta"],
    },
    {
        "key":     "pinon_poetry",
        "name":    "Pinon Poetry",
        "tribe":   "Chakma Collection",
        "tagline": "Where geometry meets grace.",
        "items":   ["Pinon Wrap", "Hadi Top", "Chakma Saree", "Festive Pinon", "Geometric Set", "Hadi Dupatta"],
    },
    {
        "key":     "waichum_whispers",
        "name":    "Waichum Whispers",
        "tribe":   "Jamatia Collection",
        "tagline": "Quiet elegance. Roots that run deep.",
        "items":   ["Waichum Set", "Panchi Drape", "Jamatia Saree", "Festive Waichum", "Bridal Panchi", "Daily Set"],
    },
    {
        "key":     "sacred_threads",
        "name":    "Sacred Threads",
        "tribe":   "Mog Collection",
        "tagline": "Woven with devotion, worn with pride.",
        "items":   ["Mog Weave", "Sacred Wrap", "Mog Saree", "Festive Set", "Bridal Mog", "Daily Wrap"],
    },
    {
        "key":     "hill_collective",
        "name":    "The Hill Collective",
        "tribe":   "Others",
        "tagline": "Many tribes. One living tradition.",
        "items":   ["Halam Weave", "Garo Drape", "Lushai Set", "Tribal Mix", "Hill Saree", "Collective Set"],
    },
]
COLLECTION_MAP = {c["key"]: c for c in COLLECTIONS}

_WW_CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Cinzel:wght@400;600&family=Cormorant+Garamond:wght@300;400;600&display=swap');

.ww-header {
    background: linear-gradient(160deg, #1A0A00 0%, #3d1500 60%, #1A0A00 100%);
    padding: 52px 32px 44px;
    text-align: center;
    border-bottom: 1px solid rgba(200,151,42,0.2);
    margin: -2rem -3rem 0;
}
.ww-eyebrow {
    font-family: 'Cinzel', serif;
    font-size: 0.65rem;
    letter-spacing: 0.35em;
    color: #C8972A;
    text-transform: uppercase;
    margin-bottom: 12px;
}
.ww-title {
    font-family: 'Playfair Display', serif;
    font-size: clamp(2rem, 5vw, 3.2rem);
    color: #FAF3E8;
    font-weight: 700;
    margin-bottom: 10px;
}
.ww-subtitle {
    font-family: 'Cormorant Garamond', serif;
    font-size: 1.05rem;
    color: rgba(250,243,232,0.55);
    max-width: 480px;
    margin: 0 auto;
    line-height: 1.7;
}

.coll-card {
    border-radius: 10px;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    margin-bottom: 8px;
}
.coll-img {
    width: 100%;
    aspect-ratio: 3/4;
    background: linear-gradient(160deg, #e8ddd0 0%, #c8b49a 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
}
.coll-img-label {
    font-family: 'Cinzel', serif;
    font-size: 0.5rem;
    letter-spacing: 0.25em;
    color: rgba(26,10,0,0.3);
    text-transform: uppercase;
}
.coll-info { padding: 16px 16px 20px; background: #fff; }
.coll-tribe {
    font-family: 'Cinzel', serif;
    font-size: 0.55rem;
    letter-spacing: 0.3em;
    color: #C8972A;
    text-transform: uppercase;
    margin-bottom: 5px;
}
.coll-name {
    font-family: 'Playfair Display', serif;
    font-size: 1.05rem;
    color: #1A0A00;
    font-weight: 700;
    margin-bottom: 5px;
}
.coll-tagline {
    font-family: 'Cormorant Garamond', serif;
    font-size: 0.85rem;
    color: #888;
    line-height: 1.5;
}

/* collection detail header */
.col-hero {
    background: linear-gradient(160deg, #1A0A00 0%, #3d1500 60%, #1A0A00 100%);
    padding: 44px 32px 36px;
    text-align: center;
    margin: -2rem -3rem 0;
    border-bottom: 1px solid rgba(200,151,42,0.2);
}
.col-hero-tribe {
    font-family: 'Cinzel', serif;
    font-size: 0.6rem;
    letter-spacing: 0.35em;
    color: #C8972A;
    text-transform: uppercase;
    margin-bottom: 10px;
}
.col-hero-name {
    font-family: 'Playfair Display', serif;
    font-size: clamp(1.8rem, 4vw, 2.8rem);
    color: #FAF3E8;
    font-weight: 700;
    margin-bottom: 8px;
}
.col-hero-tagline {
    font-family: 'Cormorant Garamond', serif;
    font-size: 1rem;
    color: rgba(250,243,232,0.5);
}

/* product grid */
.prod-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    padding: 32px 0 48px;
}
@media (max-width: 768px) { .prod-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; } }

.prod-card { border-radius: 8px; overflow: hidden; background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,0.07); }
.prod-img-placeholder {
    width: 100%;
    aspect-ratio: 3/4;
    background: linear-gradient(160deg, #e8ddd0 0%, #d4c4b0 100%);
    display: flex; align-items: center; justify-content: center;
}
.prod-img-placeholder span {
    font-family: 'Cinzel', serif;
    font-size: 0.5rem;
    letter-spacing: 0.2em;
    color: rgba(26,10,0,0.28);
    text-transform: uppercase;
}
.prod-info { padding: 14px 14px 18px; }
.prod-name { font-family: 'Playfair Display', serif; font-size: 0.95rem; color: #1A0A00; margin-bottom: 5px; }
.prod-price { font-family: 'Cinzel', serif; font-size: 0.72rem; color: #C8972A; letter-spacing: 0.1em; }
</style>
"""


def render_womens_wear():
    st.markdown(_PAGE_CSS, unsafe_allow_html=True)
    st.markdown(_WW_CSS, unsafe_allow_html=True)

    st.markdown("""
    <div class="ww-header">
        <div class="ww-eyebrow">✦ &nbsp; Indigenous Handloom &nbsp; ✦</div>
        <h1 class="ww-title">Women's Wear</h1>
        <p class="ww-subtitle">
            Six tribes. Six distinct weaving traditions.<br/>
            Each thread a story passed from mother to daughter.
        </p>
    </div>
    """, unsafe_allow_html=True)

    st.markdown("<br/>", unsafe_allow_html=True)
    if st.button("← Back to Home", key="ww_back"):
        nav_to("home")
    st.markdown("<br/>", unsafe_allow_html=True)

    # 6 collection cards in 2 rows of 3
    rows = [COLLECTIONS[i:i+3] for i in range(0, len(COLLECTIONS), 3)]
    for row in rows:
        cols = st.columns(len(row), gap="medium")
        for col, c in zip(cols, row):
            with col:
                st.markdown(f"""
                <div class="coll-card">
                    <div class="coll-img">
                        <span class="coll-img-label">Photo Coming Soon</span>
                    </div>
                    <div class="coll-info">
                        <div class="coll-tribe">{c['tribe']}</div>
                        <div class="coll-name">{c['name']}</div>
                        <div class="coll-tagline">{c['tagline']}</div>
                    </div>
                </div>
                """, unsafe_allow_html=True)
                if st.button("Explore →", key=f"coll_{c['key']}"):
                    st.session_state.womens_collection = c["key"]
                    nav_to("womens_collection")


def render_womens_collection():
    key = st.session_state.get("womens_collection")
    c   = COLLECTION_MAP.get(key)
    if not c:
        nav_to("womens_wear")
        return

    st.markdown(_PAGE_CSS, unsafe_allow_html=True)
    st.markdown(_WW_CSS,   unsafe_allow_html=True)

    st.markdown(f"""
    <div class="col-hero">
        <div class="col-hero-tribe">{c['tribe']}</div>
        <h1 class="col-hero-name">{c['name']}</h1>
        <p class="col-hero-tagline">{c['tagline']}</p>
    </div>
    """, unsafe_allow_html=True)

    st.markdown("<br/>", unsafe_allow_html=True)
    bcol1, bcol2 = st.columns([1, 5])
    with bcol1:
        if st.button("← Back", key="col_back"):
            nav_to("womens_wear")

    cards_html = '<div class="prod-grid">'
    for item in c["items"]:
        cards_html += f"""
        <div class="prod-card">
            <div class="prod-img-placeholder"><span>Photo Coming Soon</span></div>
            <div class="prod-info">
                <div class="prod-name">{item}</div>
                <div class="prod-price">₹ — — —</div>
            </div>
        </div>"""
    cards_html += "</div>"
    st.markdown(cards_html, unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════════════════════════
#  OTHER PAGES
# ═══════════════════════════════════════════════════════════════════════════════
def render_mens_wear():
    _placeholder("Men's Wear", "🧥",
        "Kubai tops, Rignai Dhoti bottoms — traditional Tripuri masculinity, coming soon.")

def render_jewellery():
    _placeholder("Tribal Jewellery", "💎",
        "Hand-hammered silver torques, coin necklaces and earrings — coming soon.")

def render_home_decor():
    _placeholder("Home Décor", "🏡",
        "Bamboo lamps, baskets, furniture and gift sets — handcrafted, coming soon.")


def render_contact():
    st.markdown(_PAGE_CSS, unsafe_allow_html=True)
    st.markdown("""
    <div style="text-align:center; padding: 70px 20px 40px;">
      <p style="font-size:.75rem; letter-spacing:.3em; color:#C8972A;
         text-transform:uppercase; margin-bottom:10px;">GET IN TOUCH</p>
      <h1 style="font-family:'Georgia',serif; font-size:2.4rem; color:#1A0A00;
         font-weight:600; margin-bottom:14px;">Contact Us</h1>
      <p style="color:#888; font-size:1rem; line-height:1.8; max-width:480px; margin:0 auto;">
        We're a small team in Tripura — your message will always reach a real person.
      </p>
    </div>
    """, unsafe_allow_html=True)

    c1, c2 = st.columns(2)
    with c1:
        st.markdown("""
        <div style="background:#fff;border-radius:12px;padding:28px;
            box-shadow:0 2px 12px rgba(0,0,0,.07); margin-bottom:20px;">
          <div style="font-size:2rem; margin-bottom:10px;">📱</div>
          <div style="font-weight:600; color:#1A0A00; margin-bottom:6px;">WhatsApp / Phone</div>
          <div style="color:#666;">+91 XXXXX XXXXX</div>
          <div style="font-size:.85rem; color:#999; margin-top:4px;">Mon–Sat, 10 AM – 6 PM IST</div>
        </div>
        <div style="background:#fff;border-radius:12px;padding:28px;
            box-shadow:0 2px 12px rgba(0,0,0,.07);">
          <div style="font-size:2rem; margin-bottom:10px;">✉️</div>
          <div style="font-weight:600; color:#1A0A00; margin-bottom:6px;">Email</div>
          <div style="color:#666;">hello@tripuracraftsmen.com</div>
          <div style="font-size:.85rem; color:#999; margin-top:4px;">We reply within 24 hours</div>
        </div>
        """, unsafe_allow_html=True)
    with c2:
        st.markdown("""
        <div style="background:#fff;border-radius:12px;padding:28px;
            box-shadow:0 2px 12px rgba(0,0,0,.07); margin-bottom:20px;">
          <div style="font-size:2rem; margin-bottom:10px;">📍</div>
          <div style="font-weight:600; color:#1A0A00; margin-bottom:6px;">Location</div>
          <div style="color:#666;">Agartala, Tripura<br/>Northeast India — 799 001</div>
        </div>
        <div style="background:#fff;border-radius:12px;padding:28px;
            box-shadow:0 2px 12px rgba(0,0,0,.07);">
          <div style="font-size:2rem; margin-bottom:10px;">🕐</div>
          <div style="font-weight:600; color:#1A0A00; margin-bottom:6px;">Working Hours</div>
          <div style="color:#666;">Monday – Saturday<br/>10:00 AM – 6:00 PM IST</div>
        </div>
        """, unsafe_allow_html=True)

    st.markdown("<br/>", unsafe_allow_html=True)
    col = st.columns([2, 1, 2])[1]
    with col:
        if st.button("← Back to Home", use_container_width=True):
            nav_to("home")


def render_help():
    st.markdown(_PAGE_CSS, unsafe_allow_html=True)
    st.markdown("""
    <div style="text-align:center; padding: 70px 20px 40px;">
      <p style="font-size:.75rem; letter-spacing:.3em; color:#C8972A;
         text-transform:uppercase; margin-bottom:10px;">SUPPORT</p>
      <h1 style="font-family:'Georgia',serif; font-size:2.4rem; color:#1A0A00;
         font-weight:600; margin-bottom:14px;">Help &amp; FAQs</h1>
    </div>
    """, unsafe_allow_html=True)

    faqs = [
        ("How long does delivery take?",
         "Orders are dispatched within 2–3 business days from Tripura. Delivery across India takes 5–8 business days. You'll receive a tracking link via email and WhatsApp once shipped."),
        ("Are the products genuinely handmade?",
         "Every product is handcrafted by indigenous artisans from Tripura's tribal communities. Each piece comes with a certificate of authenticity."),
        ("What is the return & exchange policy?",
         "We accept returns within 7 days of delivery if the item is unused and in original condition. Contact us via WhatsApp or email to initiate."),
        ("Can I place a custom or bulk order?",
         "Yes! We welcome custom orders for weddings, corporate gifting, and bulk purchases. Reach out via WhatsApp or email with your requirements."),
        ("Which payment methods are accepted?",
         "We accept all major UPI apps (GPay, PhonePe, Paytm), credit/debit cards and net banking via Razorpay. All transactions are fully secure."),
    ]
    for q, a in faqs:
        with st.expander(q):
            st.write(a)

    st.markdown("<br/>", unsafe_allow_html=True)
    c1, c2, c3 = st.columns([2, 1, 2])
    with c2:
        if st.button("← Back to Home", use_container_width=True):
            nav_to("home")
        if st.button("📞 Contact Us", use_container_width=True):
            nav_to("contact")


def render_track_order():
    _placeholder("Track Your Order", "📦",
        "Enter your email address to see all your past orders — coming soon.")


# ═══════════════════════════════════════════════════════════════════════════════
#  ROUTER
# ═══════════════════════════════════════════════════════════════════════════════
page = st.session_state.page

if   page == "home":                render_home()
elif page == "womens_wear":         render_womens_wear()
elif page == "womens_collection":   render_womens_collection()
elif page == "mens_wear":           render_mens_wear()
elif page == "jewellery":           render_jewellery()
elif page == "home_decor":          render_home_decor()
elif page == "contact":             render_contact()
elif page == "help":                render_help()
elif page == "track_order":         render_track_order()
else:                               render_home()
