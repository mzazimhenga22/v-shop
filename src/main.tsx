import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import "./index.css";
import 'react-toastify/dist/ReactToastify.css';
import { CartProvider } from "./context/CartContext"; // NEW

const theme = localStorage.getItem("theme");
if (theme === "dark") {
  document.documentElement.classList.add("dark");
} else {
  document.documentElement.classList.remove("dark");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <CartProvider> {/* Wrap App with CartProvider */}
        <App />
      </CartProvider>
    </BrowserRouter>
  </StrictMode>
);
