import { Link } from "react-router-dom";

function App() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-bone">
      <h1 className="text-3xl font-semibold">SetList</h1>
      <div className="flex gap-4">
        <Link to="/e/demo" className="text-sodium underline">
          Guest demo (/e/demo)
        </Link>
        <Link to="/admin" className="text-sodium underline">
          Admin (/admin)
        </Link>
      </div>
    </div>
  );
}

export default App;
