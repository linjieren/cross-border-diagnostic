import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Home from "./pages/Home";
import AgentThinkingPage from "./pages/AgentThinkingPage";
import ReportPage from "./pages/ReportPage";
import HistoryPage from "./pages/HistoryPage";
import LoginModal from "./components/LoginModal";
import UserMenu from "./components/UserMenu";
import LangSwitcher from "./components/LangSwitcher";

function Layout({ children }: { children: React.ReactNode }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const { isLoggedIn } = useAuth();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    document.title = t('report.platformName')
  }, [t, i18n.language])

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="text-lg font-bold text-gray-900">
            {t("nav.home")}
          </Link>
          <div className="flex items-center gap-4">
            <LangSwitcher />
            {isLoggedIn && (
              <Link
                to="/history"
                className="text-sm text-gray-600 hover:text-gray-900 transition"
              >
                {t("nav.history")}
              </Link>
            )}
            <UserMenu onLoginClick={() => setLoginOpen(true)} />
          </div>
        </div>
      </nav>
      <main>{children}</main>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/thinking/:sessionId" element={<AgentThinkingPage />} />
            <Route path="/report/:sessionId" element={<ReportPage />} />
            <Route path="/history" element={<HistoryPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  );
}
