const made = new Set();
const collected = new WeakSet();
const isHandle = (value) => typeof value === "object" && value !== null && typeof value.delete === "function" && typeof value.isDeleted === "function";
/** Wraps every function on `owner`, and those it inherits, to note each handle it returns. */
function wrap(owner) {
    const methods = new Map();
    for (let level = owner; level && level !== Object.prototype && level !== Function.prototype; level = Object.getPrototypeOf(level)) {
        for (const name of Object.getOwnPropertyNames(level)) {
            const value = Object.getOwnPropertyDescriptor(level, name)?.value;
            if (typeof value === "function" && !methods.has(name) && !["constructor", "delete", "isDeleted", "deleteLater"].includes(name))
                methods.set(name, value);
        }
    }
    for (const [name, original] of methods) {
        owner[name] = function (...args) {
            const result = original.apply(this, args);
            for (const value of Array.isArray(result) ? result : [result])
                if (isHandle(value))
                    made.add(value);
            return result;
        };
    }
}
/** From now on, notes every handle made on this instance, for `freeAll`. */
export function collect(wasm) {
    if (collected.has(wasm))
        return;
    collected.add(wasm);
    wasm.setup();
    const { Manifold, CrossSection } = wasm;
    const manifold = Manifold.cube([1, 1, 1]);
    const section = CrossSection.square([1, 1]);
    wrap(Object.getPrototypeOf(manifold));
    wrap(Object.getPrototypeOf(section));
    manifold.delete();
    section.delete();
    wrap(Manifold);
    wrap(CrossSection);
}
/** Deletes every handle noted since the last call. */
export function freeAll() {
    for (const handle of made)
        if (!handle.isDeleted())
            handle.delete();
    made.clear();
}
