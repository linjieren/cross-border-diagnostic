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

  useEffect(() => {
    if (!open) {
      setMode("email");
      setQrUrl("");
      setQrError("");
      return;
    }
  }, [open]);

  useEffect(() => {
    if (mode !== "wechat" || !open) return;

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
      } catch {
        setQrError(t("home.errorNetwork"));
      } finally {
        setQrLoading(false);
      }
    };

    fetchQR();
  }, [mode, open, t]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="gm-modal-backdrop" />
      <div
        className="gm-modal w-full max-w-sm p-6 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {mode === "email"
              ? step === "input"
                ? t("login.titleInput")
                : t("login.titleVerify")
              : t("login.wechatLogin")}
          </h2>
          <button onClick={onClose} className="gm-meta-copy text-xl hover:opacity-70">
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex mb-4" style={{ borderBottom: "1px solid var(--gm-border)" }}>
          <button
            onClick={() => setMode("email")}
            className="flex-1 pb-2 text-sm font-medium text-center"
            style={
              mode === "email"
                ? { color: "var(--gm-blue-strong)", borderBottom: "2px solid var(--gm-blue)" }
                : { color: "var(--gm-text-soft)" }
            }
          >
            {t("login.titleInput")}
          </button>
          <button
            onClick={() => setMode("wechat")}
            className="flex-1 pb-2 text-sm font-medium text-center"
            style={
              mode === "wechat"
                ? { color: "#188038", borderBottom: "2px solid var(--gm-green)" }
                : { color: "var(--gm-text-soft)" }
            }
          >
            {t("login.wechatLogin")}
          </button>
        </div>

        {mode === "email" ? (
          <>
            {step === "input" ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t("login.emailLabel")}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="gm-input text-sm"
                  />
                </div>
                <button
                  onClick={handleSendCode}
                  disabled={loading}
                  className="gm-btn gm-btn-primary w-full text-sm"
                >
                  {loading ? t("common.loading") : t("login.sendCode")}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("login.codeSentTo")} {email}
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    className="gm-input text-sm text-center tracking-widest"
                  />
                </div>
                <button
                  onClick={handleVerify}
                  disabled={loading}
                  className="gm-btn gm-btn-primary w-full text-sm"
                >
                  {loading ? t("common.loading") : t("nav.login")}
                </button>
                <button
                  onClick={() => setStep("input")}
                  className="gm-link w-full text-sm text-center"
                >
                  {t("login.reEnterEmail")}
                </button>
              </div>
            )}

            {error && <p className="mt-3 text-sm text-center" style={{ color: "#b3261e" }}>{error}</p>}
          </>
        ) : (
          <div className="flex flex-col items-center space-y-4 min-h-[240px]">
            {qrLoading ? (
              <div className="py-8 text-sm gm-meta-copy">{t("wechatLogin.loading")}</div>
            ) : qrError ? (
              <div className="py-8 text-sm text-center" style={{ color: "#b3261e" }}>{qrError}</div>
            ) : qrUrl ? (
              <>
                <div
                  className="w-48 h-48 overflow-hidden flex items-center justify-center"
                  style={{
                    border: "1px solid var(--gm-border)",
                    borderRadius: "var(--gm-radius-sm)",
                    background: "var(--gm-surface-muted)",
                  }}
                >
                  <img src={qrUrl} alt="WeChat QR" className="w-full h-full object-contain" />
                </div>
                <p className="text-sm text-center" style={{ color: "var(--gm-text-soft)" }}>
                  {t("wechatLogin.scanPrompt")}
                </p>
                <p className="gm-meta-copy text-center">{t("wechatLogin.scanTip")}</p>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
