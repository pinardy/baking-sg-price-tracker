import { useCallback, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { IS_STATIC } from './api';
import { FetchStatusBar } from './components/FetchStatusBar';
import { Dashboard } from './pages/Dashboard';
import { ProductDetail } from './pages/ProductDetail';
import { AddProduct } from './pages/AddProduct';

export default function App() {
  const [dataVersion, setDataVersion] = useState(0);

  // Bumped whenever a fetch run finishes so pages reload their data.
  const onDataChanged = useCallback(() => {
    setDataVersion((v) => v + 1);
  }, []);

  return (
    <>
      <header className="app-header">
        <Link to="/" className="brand">🧁 SG Baking Price Tracker</Link>
        <nav />
        <FetchStatusBar onRunFinished={onDataChanged} />
      </header>
      {IS_STATIC && (
        <div className="static-banner">
          Read-only snapshot — prices update daily.
        </div>
      )}
      <main>
        <Routes>
          <Route path="/" element={<Dashboard dataVersion={dataVersion} />} />
          <Route path="/products/:id" element={<ProductDetail dataVersion={dataVersion} />} />
          {!IS_STATIC && <Route path="/add" element={<AddProduct />} />}
        </Routes>
      </main>
    </>
  );
}
