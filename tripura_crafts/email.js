const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// ── Email to ADMIN when new order arrives ─────────────────────────────────
async function notifyAdmin(order) {
  const sizeText = order.size ? ` — Size ${order.size}` : '';
  await transporter.sendMail({
    from: `"Mwktai Orders" <${process.env.GMAIL_USER}>`,
    to:   'mwktaitripura@gmail.com',
    subject: `🛍 New Order #${order.id} — ${order.product_name}`,
    html: `
      <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#1a0a00;color:#FAF3E8;padding:36px;border-radius:8px;">
        <h2 style="color:#C8972A;font-size:1.4rem;margin-bottom:4px;">New Order on Mwktai</h2>
        <p style="color:rgba(250,243,232,0.4);font-size:0.85rem;margin-bottom:28px;">Order #${order.id}</p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr><td style="padding:8px 0;color:rgba(250,243,232,0.5);font-size:0.9rem;">Product</td>
              <td style="padding:8px 0;font-weight:bold;">${order.product_name}${sizeText}</td></tr>
          <tr><td style="padding:8px 0;color:rgba(250,243,232,0.5);font-size:0.9rem;">Price</td>
              <td style="padding:8px 0;color:#C8972A;font-weight:bold;">₹${order.price_paid}</td></tr>
          <tr><td style="padding:8px 0;color:rgba(250,243,232,0.5);font-size:0.9rem;border-top:1px solid rgba(200,151,42,0.15);">Customer</td>
              <td style="padding:8px 0;border-top:1px solid rgba(200,151,42,0.15);">${order.customer_name}</td></tr>
          <tr><td style="padding:8px 0;color:rgba(250,243,232,0.5);font-size:0.9rem;">Phone</td>
              <td style="padding:8px 0;">${order.customer_phone}</td></tr>
          <tr><td style="padding:8px 0;color:rgba(250,243,232,0.5);font-size:0.9rem;">Address</td>
              <td style="padding:8px 0;">${order.customer_address}</td></tr>
        </table>

        <a href="https://mwktai.up.railway.app/admin"
           style="display:inline-block;padding:12px 28px;background:#C8972A;color:#1A0A00;text-decoration:none;font-family:Georgia,serif;font-weight:bold;border-radius:3px;">
          View in Admin Dashboard →
        </a>
      </div>`,
  });
}

// ── Email to CUSTOMER when order is confirmed ─────────────────────────────
async function notifyCustomerConfirmed(order) {
  if (!order.customer_email) return; // no email address, skip
  const sizeText = order.size ? ` (Size ${order.size})` : '';
  await transporter.sendMail({
    from:    `"Mwktai" <${process.env.GMAIL_USER}>`,
    to:      order.customer_email,
    subject: `Your Mwktai order is confirmed ✦ Order #${order.id}`,
    html: `
      <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#1a0a00;color:#FAF3E8;padding:36px;border-radius:8px;">
        <h2 style="color:#C8972A;font-size:1.4rem;margin-bottom:4px;">Your order is confirmed</h2>
        <p style="color:rgba(250,243,232,0.5);margin-bottom:28px;">Thank you, ${order.customer_name}. We've confirmed your order and our artisans are preparing it.</p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
          <tr><td style="padding:8px 0;color:rgba(250,243,232,0.5);font-size:0.9rem;">Order</td>
              <td style="padding:8px 0;">#${order.id}</td></tr>
          <tr><td style="padding:8px 0;color:rgba(250,243,232,0.5);font-size:0.9rem;">Product</td>
              <td style="padding:8px 0;font-weight:bold;">${order.product_name}${sizeText}</td></tr>
          <tr><td style="padding:8px 0;color:rgba(250,243,232,0.5);font-size:0.9rem;">Amount</td>
              <td style="padding:8px 0;color:#C8972A;">₹${order.price_paid}</td></tr>
          <tr><td style="padding:8px 0;color:rgba(250,243,232,0.5);font-size:0.9rem;">Delivery to</td>
              <td style="padding:8px 0;">${order.customer_address}</td></tr>
        </table>

        <p style="color:rgba(250,243,232,0.4);font-size:0.9rem;line-height:1.7;">
          Your order will be shipped within 5–7 days. You'll receive another email with the tracking details once it's dispatched.<br/><br/>
          For any questions, reply to this email or reach us at mwktaitripura@gmail.com.
        </p>

        <p style="margin-top:28px;color:#C8972A;font-style:italic;">"We don't just sell cloth. We sell memory."</p>
        <p style="color:rgba(250,243,232,0.3);font-size:0.8rem;margin-top:4px;">— Mwktai, Tripura</p>
      </div>`,
  });
}

// ── Email to CUSTOMER when order is shipped ───────────────────────────────
async function notifyCustomerShipped(order) {
  if (!order.customer_email) return;
  const sizeText = order.size ? ` (Size ${order.size})` : '';
  await transporter.sendMail({
    from:    `"Mwktai" <${process.env.GMAIL_USER}>`,
    to:      order.customer_email,
    subject: `Your Mwktai order is on its way ✦ Order #${order.id}`,
    html: `
      <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#1a0a00;color:#FAF3E8;padding:36px;border-radius:8px;">
        <h2 style="color:#C8972A;font-size:1.4rem;margin-bottom:4px;">Your order is on its way</h2>
        <p style="color:rgba(250,243,232,0.5);margin-bottom:28px;">Great news, ${order.customer_name}! Your order has been dispatched.</p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
          <tr><td style="padding:8px 0;color:rgba(250,243,232,0.5);font-size:0.9rem;">Order</td>
              <td style="padding:8px 0;">#${order.id}</td></tr>
          <tr><td style="padding:8px 0;color:rgba(250,243,232,0.5);font-size:0.9rem;">Product</td>
              <td style="padding:8px 0;font-weight:bold;">${order.product_name}${sizeText}</td></tr>
          <tr><td style="padding:8px 0;color:rgba(250,243,232,0.5);font-size:0.9rem;">Tracking No.</td>
              <td style="padding:8px 0;color:#C8972A;font-weight:bold;">${order.tracking_number || 'Will be updated shortly'}</td></tr>
          <tr><td style="padding:8px 0;color:rgba(250,243,232,0.5);font-size:0.9rem;">Delivering to</td>
              <td style="padding:8px 0;">${order.customer_address}</td></tr>
        </table>

        <p style="color:rgba(250,243,232,0.4);font-size:0.9rem;line-height:1.7;">
          You can track your shipment using the tracking number above on the courier's website.<br/><br/>
          For any questions, reach us at mwktaitripura@gmail.com.
        </p>

        <p style="margin-top:28px;color:#C8972A;font-style:italic;">"We don't just sell cloth. We sell memory."</p>
        <p style="color:rgba(250,243,232,0.3);font-size:0.8rem;margin-top:4px;">— Mwktai, Tripura</p>
      </div>`,
  });
}

module.exports = { notifyAdmin, notifyCustomerConfirmed, notifyCustomerShipped };
