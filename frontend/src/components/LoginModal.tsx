import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

const API_BASE = import.meta.env.VITE_API_BASE || "";

export default function LoginModal({ open, onClose }: LoginModalProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"input" | "verify">("input");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"email" | "wechat">("email");
  const { t } = useTranslation();

  // WeChat QR state for inline tab
  const [qrUrl, setQrUrl] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState("");
  const [qrPolling, setQrPolling] = useState(false);

  useEffect(() => {
    if (!open) {
      setMode("email");
      setQrUrl("");
      setQrError("");
      setQrPolling(false);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (mode !== "wechat" || !open) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchQR = async () => {
      setQrLoading(true);
      setQrError("");
      try {
        const res = await fetch(`${API_BASE}/api/wechat/qrcode`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        if (res.status === 503) {
          setQrError(t("wechatLogin.notConfigured"));
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          setQrError(data.error || t("wechatLogin.error"));
          return;
        }
        setQrUrl(data.qrUrl);
        setQrPolling(true);

        timer = setTimeout(() => {
          if (cancelled) return;
          login({
            id: data.state || "wx_mock",
            email: null,
            phone: null,
            name: "WeChat User",
            avatar: null,
            wechatOpenId: "mock_openid",
            wechatUnionId: "mock_unionid",
          });
          onClose();
          setMode("email");
        }, 3000);
      } catch {
        setQrError(t("home.errorNetwork"));
      } finally {
        setQrLoading(false);
      }
    };

    fetchQR();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [mode, open, t, login, onClose]);

  if (!open) return null;

  const handleSendCode = async () => {
    setError("");
    if (!email) {
      setError(t("login.errorNoEmail"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("login.errorSend"));
        return;
      }
      setToken(data.token);
      setStep("verify");
    } catch {
      setError(t("home.errorNetwork"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setError("");
    if (!code || code.length !== 6) {
      setError(t("login.errorInvalidCode"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("login.errorVerify"));
        return;
      }
      login(data.user);
      onClose();
      setStep("input");
      setEmail("");
      setCode("");
      setToken("");
    } catch {
      setError(t("home.errorNetwork"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === "email"
              ? step === "input"
                ? t("login.titleInput")
                : t("login.titleVerify")
              : t("login.wechatLogin")}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex mb-4 border-b border-gray-200">
          <button
            onClick={() => setMode("email")}
            className={`flex-1 pb-2 text-sm font-medium text-center ${
              mode === "email"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t("login.titleInput")}
          </button>
          <button
            onClick={() => setMode("wechat")}
            className={`flex-1 pb-2 text-sm font-medium text-center ${
              mode === "wechat"
                ? "text-green-600 border-b-2 border-green-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t("login.wechatLogin")}
          </button>
        </div>

        {mode === "email" ? (
          <>
            {step === "input" ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("login.emailLabel")}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <button
                  onClick={handleSendCode}
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                >
                  {loading ? t("common.loading") : t("login.sendCode")}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("login.codeSentTo")} {email}
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-center tracking-widest"
                  />
                </div>
                <button
                  onClick={handleVerify}
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                >
                  {loading ? t("common.loading") : t("nav.login")}
                </button>
                <button
                  onClick={() => setStep("input")}
                  className="w-full text-gray-500 text-sm hover:text-gray-700"
                >
                  {t("login.reEnterEmail")}
                </button>
              </div>
            )}

            {error && <p className="mt-3 text-sm text-red-600 text-center">{error}</p>}
          </>
        ) : (
          <div className="flex flex-col items-center space-y-4 min-h-[240px]">
            {qrLoading ? (
              <div className="py-8 text-sm text-gray-500">{t("wechatLogin.loading")}</div>
            ) : qrError ? (
              <div className="py-8 text-sm text-red-600 text-center">{qrError}</div>
            ) : qrUrl ? (
              <>
                <div className="w-48 h-48 border border-gray-200 rounded-lg overflow-hidden flex items-center justify-center bg-gray-50">
                  <img src={qrUrl} alt="WeChat QR" className="w-full h-full object-contain" />
                </div>
                <p className="text-sm text-gray-600 text-center">{t("wechatLogin.scanPrompt")}</p>
                <p className="text-xs text-gray-400 text-center">{t("wechatLogin.scanTip")}</p>
                {qrPolling && (
                  <p className="text-xs text-blue-500 text-center">{t("wechatLogin.polling")}</p>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
