import { BrowserRouter, Routes, Route } from "react-router-dom";
import ConnectionManager from "./pages/ConnectionManager";
import DatabaseView from "./pages/DatabaseView";
import DatabaseSelector from "./pages/DatabaseSelector";
import UpdateChecker from "./components/UpdateChecker";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <div className="h-full bg-bg-primary">
        <Routes>
          <Route path="/" element={<ConnectionManager />} />
          <Route path="/select-database" element={<DatabaseSelector />} />
          <Route path="/database" element={<DatabaseView />} />
        </Routes>
        <UpdateChecker />
      </div>
    </BrowserRouter>
  );
}

export default App;
