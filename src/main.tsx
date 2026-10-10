import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

document.title = "CyberDossier · VRCF Informática & Segurança";

createRoot(document.getElementById("root")!).render(<App />);
