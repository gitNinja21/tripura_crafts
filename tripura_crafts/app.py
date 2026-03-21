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
def render_home():
    st.markdown(_HOME_CSS, unsafe_allow_html=True)

    with open(HTML_PATH, "r", encoding="utf-8") as f:
        html = f.read()

    # 1. Inline all images as base64 (so they load inside the Streamlit iframe)
    html = _inline_images(html, _DIR)

    # 2. Override hero min-height: 100vh → fixed height
    #    (inside an iframe, 100vh = iframe height, making hero impossibly tall)
    html = html.replace(
        "</head>",
        "<style>.hero { min-height: 620px !important; }</style>\n</head>",
        1,
    )

    # 3. Serve it — height covers all sections (hero + cards + jewellery +
    #    heritage + help + contact + footer), scrolling handled by outer page
    components.html(html, height=4400, scrolling=False)


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
    _placeholder(
        "Women's Wear", "👘",
        "Handwoven Risa, Rignai, Sarees, Shawls and more — the full collection is coming soon."
    )


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
