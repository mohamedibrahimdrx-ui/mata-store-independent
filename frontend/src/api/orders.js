
import { API_BASE as API_URL } from "./base";
const TIMEOUT_MS = 15000;
const STORAGE_KEY = "mata_pending_order_v1";

export class OrderError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function getPendingRequest() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePendingRequest(request) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(request));
  } catch {
    throw new OrderError(
      "STORAGE_UNAVAILABLE",
      "مش قادرين نحفظ بيانات محاولة الطلب بأمان. جرّب تفتح المتجر في نافذة عادية."
    );
  }
}

function clearPendingRequest() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Keep the successful response as the source of truth.
  }
}

export async function submitOrder({ customer, items }) {
  const requestBody = {
    paymentMethod: "cod",
    customer,
    items,
  };

  const fingerprint = JSON.stringify(requestBody);
  let pending = getPendingRequest();

  // Reuse the same key only for the same checkout payload.
  if (!pending || pending.fingerprint !== fingerprint || !pending.key) {
    pending = {
      fingerprint,
      key: crypto.randomUUID(),
    };

    savePendingRequest(pending);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}/api/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": pending.key,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    let data = null;

    try {
      data = await response.json();
    } catch {
      // The server returned no JSON.
    }

    if (!response.ok) {
      const message =
        response.status < 500 && typeof data?.message === "string"
          ? data.message
          : "حصلت مشكلة أثناء تسجيل الطلب. حاول تاني بعد شوية.";

      // Keep the key after network/server failures so retrying is safe.
      throw new OrderError("SERVER", message);
    }

    if (!data?.orderNumber) {
      throw new OrderError(
        "BAD_RESPONSE",
        "مش قادرين نتأكد من تسجيل الطلب. تواصل مع خدمة العملاء قبل إعادة المحاولة."
      );
    }

    clearPendingRequest();

    // Amounts are calculated by the server (database prices + shipping rules); shown to the shopper as confirmation.
    const money = (value) => (Number.isInteger(value) && value >= 0 ? value : undefined);
    return {
      orderNumber: String(data.orderNumber),
      subtotal: money(data.subtotal),
      shippingFee: money(data.shippingFee),
      total: money(data.total),
    };
  } catch (error) {
    if (error instanceof OrderError) {
      throw error;
    }

    if (error.name === "AbortError") {
      throw new OrderError(
        "TIMEOUT",
        "الاتصال أخد وقت طويل. حاول تاني بنفس الطلب."
      );
    }

    throw new OrderError(
      "NETWORK",
      "مقدرناش نتصل بالخادم. اتأكد من الإنترنت وحاول تاني بنفس الطلب."
    );
  } finally {
    clearTimeout(timer);
  }
}
