import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { User } from "../context/AuthContext";

interface WeChatQRModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
  mode?: "login" | "bind";
}

const API_BASE = import.meta.env.VITE_API_BASE || "";

export default function WeChatQRModal({ open, onClose, onSuccess, mode = "login" }: WeChatQRModalProps) {
  const { t } = useTranslation();
  const [qrUrl, setQrUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!open) {
      setQrUrl("");
      setError("");
      setPolling(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchQR = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_BASE}/api/wechat/qrcode`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        if (res.status === 503) {
          setError(t("wechatLogin.notConfigured"));
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || t("wechatLogin.error"));
          return;
        }
        setQrUrl(data.qrUrl);
        setPolling(true);

        // Simulated polling: 3-second mock success
        timer = setTimeout(() => {
          if (cancelled) return;
          const mockUser: User = {
            id: data.state || "wx_mock",
            email: null,
            phone: null,
            name: "WeChat User",
            avatar: null,
            wechatOpenId: "mock_openid",
            wechatUnionId: "mock_unionid",
          };
          onSuccess(mockUser);
        }, 3000);
      } catch {
        setError(t("home.errorNetwork"));
      } finally {
        setLoading(false);
      }
    };

    fetchQR();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [open, mode, t, onSuccess]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === "login" ? t("login.wechatLogin") : t("wechatLogin.bindWechat")}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
            &times;
          </button>
        </div>

        <div className="flex flex-col items-center space-y-4">
          {loading ? (
            <div className="py-8 text-sm text-gray-500">{t("wechatLogin.loading")}</div>
          ) : error ? (
            <div className="py-8 text-sm text-red-600 text-center">{error}</div>
          ) : qrUrl ? (
            <>
              <div className="w-48 h-48 border border-gray-200 rounded-lg overflow-hidden flex items-center justify-center bg-gray-50">
                <img src={qrUrl} alt="WeChat QR" className="w-full h-full object-contain" />
              </div>
              <p className="text-sm text-gray-600 text-center">
                {mode === "login" ? t("wechatLogin.scanPrompt") : t("wechatLogin.bindPrompt")}
              </p>
              <p className="text-xs text-gray-400 text-center">{t("wechatLogin.scanTip")}</p>
              {polling && (
                <p className="text-xs text-blue-500 text-center">{t("wechatLogin.polling")}</p>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
