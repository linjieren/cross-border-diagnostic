import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import WeChatQRModal from "./WeChatQRModal";

interface UserMenuProps {
  onLoginClick: () => void;
}

const API_BASE = import.meta.env.VITE_API_BASE || "";

export default function UserMenu({ onLoginClick }: UserMenuProps) {
  const { user, isLoggedIn, login, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [bindOpen, setBindOpen] = useState(false);
  const { t } = useTranslation();

  const refreshUser = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
      const data = await res.json();
      if (data.user) login(data.user);
    } catch {
      // ignore
    }
  };

  const handleUnbind = async () => {
    try {
      await fetch(`${API_BASE}/api/wechat/unbind`, {
        method: "POST",
        credentials: "include",
      });
      await refreshUser();
    } catch {
      // ignore
    }
    setOpen(false);
  };

  if (!isLoggedIn) {
    return (
      <button
        onClick={onLoginClick}
        className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
      >
        {t("nav.login")}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
      >
        {user?.avatar ? (
          <img src={user.avatar} alt="" className="w-7 h-7 rounded-full" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium">
            {(user?.name || user?.email || "?").charAt(0).toUpperCase()}
          </div>
        )}
        <span className="max-w-[120px] truncate hidden sm:inline">
          {user?.name || user?.email || t("common.user")}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 z-50 py-1">
            <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-100">
              {user?.email || user?.phone}
            </div>
            {user?.wechatOpenId ? (
              <button
                onClick={handleUnbind}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {t("wechatLogin.unbind")}
              </button>
            ) : (
              <button
                onClick={() => {
                  setBindOpen(true);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {t("wechatLogin.bindWechat")}
              </button>
            )}
            <button
              onClick={() => {
                logout();
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              {t("nav.logout")}
            </button>
          </div>
        </>
      )}

      <WeChatQRModal
        open={bindOpen}
        onClose={() => setBindOpen(false)}
        mode="bind"
        onSuccess={() => {
          setBindOpen(false);
          refreshUser();
        }}
      />
    </div>
  );
}
