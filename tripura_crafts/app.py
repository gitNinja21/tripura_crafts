# app.py — Tripura Craftsmen
# Run from the ecom_startup folder:
#   cd ecom_startup
#   python -m streamlit run tripura_crafts/app.py

import os
import re
import base64
import streamlit as st
import streamlit.components.v1 as components

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Tripura Craftsmen — Heritage Collection",
    page_icon="🎋",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ── Paths ─────────────────────────────────────────────────────────────────────
_DIR  = os.path.dirname(os.path.abspath(__file__))   # same folder as app.py
HTML_PATH = os.path.join(_DIR, "tripuracraftsmen_showcase.html")

# ── Session state ─────────────────────────────────────────────────────────────
def _ss(k, v):
    if k not in st.session_state:
        st.session_state[k] = v

_ss("page", "home")
_ss("cart", {})

# ── Query param routing (from HTML landing page) ──────────────────────────────
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

# ── Helpers ───────────────────────────────────────────────────────────────────
def nav_to(page):
    st.session_state.page = page
    st.rerun()

def _inline_images(html, base_dir):
    """Replace relative image src= with base64 data URIs so they load inside the iframe."""
    mime_map = {
        "jpg":  "image/jpeg", "jpeg": "image/jpeg",
        "png":  "image/png",  "webp": "image/webp",
        "avif": "image/avif", "gif":  "image/gif",
    }
    def _replace(m):
        src = m.group(1)
        # Leave absolute URLs and data URIs untouched
        if src.startswith(("http", "data:", "//", "mailto:")):
            return m.group(0)
        path = os.path.join(base_dir, src)
        if not os.path.exists(path):
            return m.group(0)
        ext  = src.rsplit(".", 1)[-1].lower()
        mime = mime_map.get(ext, "image/jpeg")
        with open(path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        return f'src="data:{mime};base64,{b64}"'
    return re.sub(r'src="([^"]+)"', _replace, html)

# ── CSS helpers ───────────────────────────────────────────────────────────────
# Strip ALL Streamlit chrome for the home page (full-bleed HTML experience)
_HOME_CSS = """
<style>
  #MainMenu, header, footer { display: none !important; }
  .block-container { padding: 0 !important; max-width: 100% !important; }
  section[data-testid="stSidebar"] { display: none !important; }
  [data-testid="stAppViewContainer"] { padding: 0 !important; }
  iframe { border: none !important; display: block !important; }
</style>
"""

# Minimal chrome for inner pages
_PAGE_CSS = """
<style>
  #MainMenu, header, footer { display: none !important; }
  .block-container { padding: 2rem 3rem !important; max-width: 1000px !important; margin: 0 auto !important; }
  section[data-testid="stSidebar"] { display: none !important; }
</style>
"""


# ═══════════════════════════════════════════════════════════════════════════════
#  HOME — serves the HTML file as a full-bleed experience
# ═══════════════════════════════════════════════════════════════════════════════
@st.cache_data(show_spinner=False)
def _build_home_html():
    """Build and cache the home page HTML — runs once, reused on every reload."""
    with open(HTML_PATH, "r", encoding="utf-8") as f:
        html = f.read()

    # Point image src to Streamlit's static file server (no base64 needed)
    # Images live in tripura_crafts/static/ and are served at /app/static/
    for img in ["women_wear.jpg", "men_wear.jpg", "jewellery.jpg",
                "home_decor.jpg", "sacred_silver.jpg"]:
        html = html.replace(f'src="{img}"', f'src="/app/static/{img}"')

    # Fix hero height inside iframe
    html = html.replace(
        "</head>",
        "<style>.hero { min-height: 620px !important; }</style>\n</head>",
        1,
    )

    # Auto-resize iframe — robust version that waits for images + fonts + animations
    auto_resize = """
    <script>
      function _sendHeight() {
        var h = Math.max(
          document.body.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.scrollHeight,
          document.documentElement.offsetHeight
        );
        window.parent.postMessage({type: 'streamlit:setFrameHeight', height: h + 40}, '*');
      }

      // Fire immediately, then after images/fonts/animations settle
      _sendHeight();
      document.addEventListener('DOMContentLoaded', _sendHeight);
      window.addEventListener('load', function() {
        _sendHeight();
        setTimeout(_sendHeight, 300);
        setTimeout(_sendHeight, 800);
        setTimeout(_sendHeight, 1500);
        setTimeout(_sendHeight, 3000);
      });
      window.addEventListener('resize', _sendHeight);

      // Watch for any layout changes (scroll reveal animations changing opacity/transform)
      if (window.ResizeObserver) {
        new ResizeObserver(_sendHeight).observe(document.body);
      }
    </script>
    </body>"""
    html = html.replace("</body>", auto_resize, 1)
    return html


def render_home():
    st.markdown(_HOME_CSS, unsafe_allow_html=True)
    # height=8000 is a safe fallback for tall mobile layouts;
    # the auto-resize script above will correct it to exact content height
    components.html(_build_home_html(), height=8000, scrolling=False)


# ═══════════════════════════════════════════════════════════════════════════════
#  PLACEHOLDER PAGES  (content added step by step)
# ═══════════════════════════════════════════════════════════════════════════════
def _placeholder(title, icon, tagline):
    """Renders a clean coming-soon placeholder page."""
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


def render_womens_wear():
    st.markdown(_PAGE_CSS, unsafe_allow_html=True)

    # ── Custom CSS for this page ──────────────────────────────────────────────
    st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Cinzel:wght@400;600&family=Cormorant+Garamond:wght@300;400;600&display=swap');

    .ww-header {
        background: linear-gradient(160deg, #1A0A00 0%, #3d1500 60%, #1A0A00 100%);
        padding: 52px 32px 40px;
        text-align: center;
        border-bottom: 1px solid rgba(200,151,42,0.2);
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
        font-size: clamp(1.8rem, 4vw, 3rem);
        color: #FAF3E8;
        font-weight: 700;
        margin-bottom: 10px;
    }
    .ww-subtitle {
        font-family: 'Cormorant Garamond', serif;
        font-size: 1.05rem;
        color: rgba(250,243,232,0.55);
        max-width: 500px;
        margin: 0 auto;
        line-height: 1.7;
    }

    /* ── Tab strip ── */
    .stTabs [data-baseweb="tab-list"] {
        gap: 0;
        background: #12060000;
        border-bottom: 1px solid rgba(200,151,42,0.2);
        overflow-x: auto;
        flex-wrap: nowrap;
        scrollbar-width: none;
        padding: 0 12px;
    }
    .stTabs [data-baseweb="tab-list"]::-webkit-scrollbar { display: none; }
    .stTabs [data-baseweb="tab"] {
        font-family: 'Cinzel', serif !important;
        font-size: 0.65rem !important;
        letter-spacing: 0.2em !important;
        color: rgba(250,243,232,0.5) !important;
        background: transparent !important;
        border: none !important;
        padding: 18px 20px !important;
        white-space: nowrap;
        border-bottom: 2px solid transparent !important;
        transition: all 0.3s;
    }
    .stTabs [aria-selected="true"] {
        color: #C8972A !important;
        border-bottom: 2px solid #C8972A !important;
    }
    .stTabs [data-baseweb="tab-panel"] {
        padding: 0 !important;
        background: #FAF3E8;
    }
    .stTabs [data-baseweb="tab-highlight"] { display: none !important; }

    /* ── Collection card ── */
    .col-header {
        padding: 36px 28px 24px;
        background: #1A0A00;
        text-align: center;
    }
    .col-name {
        font-family: 'Playfair Display', serif;
        font-size: 1.6rem;
        color: #FAF3E8;
        margin-bottom: 6px;
    }
    .col-tag {
        font-family: 'Cinzel', serif;
        font-size: 0.6rem;
        letter-spacing: 0.3em;
        color: #C8972A;
        text-transform: uppercase;
    }
    .col-tagline {
        font-family: 'Cormorant Garamond', serif;
        font-size: 1rem;
        color: rgba(250,243,232,0.55);
        margin-top: 8px;
    }

    /* ── Product placeholder grid ── */
    .prod-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
        padding: 32px 24px 48px;
        background: #FAF3E8;
    }
    @media (max-width: 768px) {
        .prod-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; padding: 20px 14px 36px; }
    }
    @media (max-width: 480px) {
        .prod-grid { grid-template-columns: 1fr 1fr; gap: 12px; }
    }
    .prod-card {
        border-radius: 8px;
        overflow: hidden;
        background: #fff;
        box-shadow: 0 2px 12px rgba(0,0,0,0.07);
    }
    .prod-img-placeholder {
        width: 100%;
        aspect-ratio: 3/4;
        background: linear-gradient(160deg, #e8ddd0 0%, #d4c4b0 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 8px;
    }
    .prod-img-placeholder span {
        font-family: 'Cinzel', serif;
        font-size: 0.55rem;
        letter-spacing: 0.25em;
        color: rgba(26,10,0,0.3);
        text-transform: uppercase;
    }
    .prod-info {
        padding: 14px 14px 16px;
    }
    .prod-name {
        font-family: 'Playfair Display', serif;
        font-size: 0.95rem;
        color: #1A0A00;
        margin-bottom: 4px;
    }
    .prod-price {
        font-family: 'Cinzel', serif;
        font-size: 0.75rem;
        color: #C8972A;
        letter-spacing: 0.1em;
    }
    </style>
    """, unsafe_allow_html=True)

    # ── Page header ───────────────────────────────────────────────────────────
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

    # ── Back button ───────────────────────────────────────────────────────────
    st.markdown("<div style='background:#1A0A00; padding: 8px 20px;'>", unsafe_allow_html=True)
    if st.button("← Home", key="ww_back"):
        nav_to("home")
    st.markdown("</div>", unsafe_allow_html=True)

    # ── Collection data ───────────────────────────────────────────────────────
    COLLECTIONS = [
        {
            "tab":     "Risa Royale",
            "tribe":   "Tripuri Collection",
            "tagline": "The original. The iconic. Two thousand years on the loom.",
            "items":   ["Risa Set", "Rignai Wrap", "Pachra Drape", "Festive Risa", "Bridal Rignai", "Everyday Set"],
        },
        {
            "tab":     "Stripe & Soul",
            "tribe":   "Reang Collection",
            "tagline": "Bold stripes, ancient stories woven thread by thread.",
            "items":   ["Rina Stripe", "Risha Weave", "Festive Rina", "Daily Risha", "Bridal Set", "Stripe Dupatta"],
        },
        {
            "tab":     "Pinon Poetry",
            "tribe":   "Chakma Collection",
            "tagline": "Where geometry meets grace.",
            "items":   ["Pinon Wrap", "Hadi Top", "Chakma Saree", "Festive Pinon", "Geometric Set", "Hadi Dupatta"],
        },
        {
            "tab":     "Waichum Whispers",
            "tribe":   "Jamatia Collection",
            "tagline": "Quiet elegance. Roots that run deep.",
            "items":   ["Waichum Set", "Panchi Drape", "Jamatia Saree", "Festive Waichum", "Bridal Panchi", "Daily Set"],
        },
        {
            "tab":     "Sacred Threads",
            "tribe":   "Mog Collection",
            "tagline": "Woven with devotion, worn with pride.",
            "items":   ["Mog Weave", "Sacred Wrap", "Mog Saree", "Festive Set", "Bridal Mog", "Daily Wrap"],
        },
        {
            "tab":     "The Hill Collective",
            "tribe":   "Others",
            "tagline": "Many tribes. One living tradition.",
            "items":   ["Halam Weave", "Garo Drape", "Lushai Set", "Tribal Mix", "Hill Saree", "Collective Set"],
        },
    ]

    # ── Tabs ──────────────────────────────────────────────────────────────────
    tabs = st.tabs([c["tab"] for c in COLLECTIONS])

    for tab, col in zip(tabs, COLLECTIONS):
        with tab:
            # Collection header
            st.markdown(f"""
            <div class="col-header">
                <div class="col-tag">{col['tribe']}</div>
                <div class="col-name">{col['tab']}</div>
                <div class="col-tagline">{col['tagline']}</div>
            </div>
            """, unsafe_allow_html=True)

            # Product placeholder grid
            cards_html = '<div class="prod-grid">'
            for item in col["items"]:
                cards_html += f"""
                <div class="prod-card">
                    <div class="prod-img-placeholder">
                        <span>Photo Coming Soon</span>
                    </div>
                    <div class="prod-info">
                        <div class="prod-name">{item}</div>
                        <div class="prod-price">₹ — — —</div>
                    </div>
                </div>"""
            cards_html += "</div>"
            st.markdown(cards_html, unsafe_allow_html=True)


def render_mens_wear():
    _placeholder(
        "Men's Wear", "🧥",
        "Kubai tops, Rignai Dhoti bottoms — traditional Tripuri masculinity, coming soon."
    )


def render_jewellery():
    _placeholder(
        "Tribal Jewellery", "💎",
        "Hand-hammered silver torques, coin necklaces and earrings — coming soon."
    )


def render_home_decor():
    _placeholder(
        "Home Décor", "🏡",
        "Bamboo lamps, baskets, furniture and gift sets — handcrafted, coming soon."
    )


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
    _placeholder(
        "Track Your Order", "📦",
        "Enter your email address to see all your past orders — coming soon."
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  ROUTER
# ═══════════════════════════════════════════════════════════════════════════════
page = st.session_state.page

if   page == "home":         render_home()
elif page == "womens_wear":  render_womens_wear()
elif page == "mens_wear":    render_mens_wear()
elif page == "jewellery":    render_jewellery()
elif page == "home_decor":   render_home_decor()
elif page == "contact":      render_contact()
elif page == "help":         render_help()
elif page == "track_order":  render_track_order()
else:                        render_home()
