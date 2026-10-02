import { parse } from "yaml";
import { readHeader } from "../core/index.ts";
import coffee from "../../fixtures/coffee.drawer.yml?raw";
import { DrawerView } from "./DrawerView.tsx";

// Until the UI opens folders of drawer files, it shows the coffee drawer fixture.
readHeader(coffee);
const drawer = parse(coffee) as { name: string; drawer: { inside: [number, number, number] } };

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
