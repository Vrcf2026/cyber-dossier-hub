import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

document.title = "CyberDossier - Gestão de Dossiers de Cibersegurança";

createRoot(document.getElementById("root")!).render(<App />);
