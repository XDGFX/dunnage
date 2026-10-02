import { load } from "../core/index.ts";
import coffee from "../../fixtures/coffee.drawer.yml?raw";
import { DrawerView } from "./DrawerView.tsx";

// Until the UI opens folders of drawer files, it shows the coffee drawer fixture.
const file = load(coffee);
if (file.kind !== "drawer") throw new Error("the coffee fixture is not a drawer");
const { drawer } = file;

export function App() {
  return (
    <main>
      <header>
        <h1>dunnage</h1>
        <p>{drawer.name}</p>
      </header>
      <DrawerView inside={drawer.drawer.inside} />
    </main>
  );
}
