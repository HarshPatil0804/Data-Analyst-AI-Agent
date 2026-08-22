import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { ToolPage } from "./pages/ToolPage";
import { HistoryPage } from "./pages/HistoryPage";
import { SplashScreen } from "./components/SplashScreen";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "./contexts/AuthContext";

function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <AuthProvider>
      <BrowserRouter>
        {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/app" element={<ToolPage />} />
            <Route path="/history" element={<HistoryPage />} />
          </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
