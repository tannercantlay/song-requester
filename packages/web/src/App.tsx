import { Link } from "react-router-dom";

function App() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white text-slate-900">
      <h1 className="text-3xl font-semibold">SetList</h1>
      <div className="flex gap-4">
        <Link to="/e/demo" className="text-purple-600 underline">
          Guest demo (/e/demo)
        </Link>
        <Link to="/admin" className="text-purple-600 underline">
          Admin (/admin)
        </Link>
      </div>
    </div>
  );
}

export default App;
