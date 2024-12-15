import { createSignal } from "solid-js";
import Canvas from "./components/Canvas";

function App() {
  // const [count, setCount] = createSignal(0);

  return (
    <>
      <Canvas />
      <button>Click me</button>
    </>
  );
}

export default App;
