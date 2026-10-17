import React, { useCallback, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import SplashScreen from "./components/SplashScreen";
import "./index.css";
import "./installPrompt";

// The intro plays once per browser session.
const SPLASH_KEY = "medicluster.seenSplash";
function shouldShowSplash() {
  if (["/", "/download"].includes(window.location.pathname)) return false;
  try { return !sessionStorage.getItem(SPLASH_KEY); } catch { return true; }
}

function Root() {
  const [showSplash, setShowSplash] = useState(shouldShowSplash);
  const finishSplash = useCallback(() => {
    try { sessionStorage.setItem(SPLASH_KEY, "1"); } catch { /* storage blocked: show again next load */ }
    setShowSplash(false);
  }, []);

  return (
    <>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
      {showSplash && <SplashScreen onDone={finishSplash} />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
