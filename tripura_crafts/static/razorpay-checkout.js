/* ──────────────────────────────────────────────────────────────────────────
   Mwktai — Razorpay Standard Web Checkout helper

   Exposes `window.MwktaiPayment.pay(orderInfo)` which:
     1. Fetches the public Razorpay key + creates an order on the backend.
     2. Opens the Razorpay modal.
     3. Verifies the signature on the backend.
     4. Calls onSuccess({ razorpay_payment_id, razorpay_order_id, razorpay_signature })
        only after a verified payment, or onError(message) otherwise.

   Loaded via <script src="/static/razorpay-checkout.js"></script>
   Requires:    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
   ────────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  let cachedKeyId = null;

  async function fetchKeyId() {
    if (cachedKeyId) return cachedKeyId;
    const res = await fetch('/api/razorpay/key');
    if (!res.ok) throw new Error('Could not load payment key');
    const { key_id } = await res.json();
    if (!key_id) throw new Error('Payment key missing');
    cachedKeyId = key_id;
    return key_id;
  }

  async function createOrder({ amountPaise, receipt, order }) {
    const res = await fetch('/api/razorpay/create-order', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      // `order` carries product_id / quantity / size / customer_* so the
      // backend can RESERVE stock before the payment modal opens.
      body:    JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, ...(order || {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Could not create order');
      err.soldOut = !!data.sold_out;   // 409 — item went out of stock
      throw err;
    }
    return data; // { order_id, amount, currency }
  }

  async function verifyPayment(payload) {
    const res = await fetch('/api/razorpay/verify-payment', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Payment verification failed');
    }
    return data;
  }

  /**
   * @param {{
   *   amountInRupees: number,
   *   productName:    string,
   *   customer:       { name: string, email?: string, phone?: string },
   *   order?:         object,   // product_id, quantity, size, customer_* — for stock reservation
   *   receipt?:       string,
   *   onSuccess:      (payment) => void,
   *   onError?:       (message)  => void,
   *   onDismiss?:     ()         => void,
   * }} opts
   */
  async function pay(opts) {
    const onError    = opts.onError    || ((m) => alert(m));
    const onDismiss  = opts.onDismiss  || (() => {});

    if (typeof window.Razorpay !== 'function') {
      return onError('Razorpay script failed to load. Check your connection and retry.');
    }

    const amountPaise = Math.round(Number(opts.amountInRupees) * 100);
    if (!Number.isInteger(amountPaise) || amountPaise < 100) {
      return onError('Invalid amount.');
    }

    let keyId, order;
    try {
      [keyId, order] = await Promise.all([
        fetchKeyId(),
        createOrder({ amountPaise, receipt: opts.receipt, order: opts.order }),
      ]);
    } catch (err) {
      // err.soldOut is set when create-order returns 409 (no stock).
      return onError(err.message || 'Could not start payment.');
    }

    const rzp = new window.Razorpay({
      key:      keyId,
      amount:   order.amount,
      currency: order.currency,
      order_id: order.order_id,
      name:     'Mwktai · Tripura Craftsmen',
      description: opts.productName || 'Order',
      prefill: {
        name:    opts.customer && opts.customer.name  || '',
        email:   opts.customer && opts.customer.email || '',
        contact: opts.customer && opts.customer.phone || '',
      },
      theme: { color: '#c8972a' },
      modal: {
        ondismiss: function () { onDismiss(); },
      },
      handler: async function (response) {
        try {
          await verifyPayment({
            razorpay_order_id:   response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature:  response.razorpay_signature,
          });
          opts.onSuccess(response);
        } catch (err) {
          onError(err.message || 'Payment verification failed.');
        }
      },
    });

    rzp.on('payment.failed', function (resp) {
      const desc = resp && resp.error && resp.error.description;
      onError(desc || 'Payment failed. Please try again.');
    });

    rzp.open();
  }

  window.MwktaiPayment = { pay };
})();
