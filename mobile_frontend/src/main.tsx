
  import { createRoot } from "react-dom/client";
  import App from "./app/App";
  import { applyFontScale, loadFontScale } from "./app/utils/fontScale";
  import "./styles/index.css";

  // Apply the saved text size before the first paint so there's no flash of the default size.
  applyFontScale(loadFontScale());

  createRoot(document.getElementById("root")!).render(<App />);
  
