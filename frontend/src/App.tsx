import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CaseScribeScreen } from "./features";
import { Gallery } from "./routes/Gallery";

/**
 * App shell. The CaseScribe screen is the product; the /gallery route stays
 * mounted as the UI-kit preview surface for dev.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CaseScribeScreen />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
