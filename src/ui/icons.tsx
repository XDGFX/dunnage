import type { ReactNode } from "react";

const icon = (paths: ReactNode) => () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
    {paths}
  </svg>
);

export const Icon = {
  lock: icon(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
  unlock: icon(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></>),
  box: icon(<><path d="M4 8l8-4 8 4v8l-8 4-8-4z" /><path d="M4 8l8 4 8-4M12 12v8" /></>),
  aside: icon(<><path d="M4 15h16v4H4z" /><path d="M12 4v8M8.5 8.5L12 12l3.5-3.5" /></>),
  back: icon(<><path d="M4 15h16v4H4z" /><path d="M12 12V4M8.5 7.5L12 4l3.5 3.5" /></>),
  left: icon(<><path d="M4 3v18" /><rect x="7" y="6" width="10" height="4" rx="1" /><rect x="7" y="14" width="6" height="4" rx="1" /></>),
  hmid: icon(<><path d="M12 3v18" /><rect x="6" y="6" width="12" height="4" rx="1" /><rect x="8" y="14" width="8" height="4" rx="1" /></>),
  right: icon(<><path d="M20 3v18" /><rect x="7" y="6" width="10" height="4" rx="1" /><rect x="11" y="14" width="6" height="4" rx="1" /></>),
  backEdge: icon(<><path d="M3 4h18" /><rect x="6" y="7" width="4" height="10" rx="1" /><rect x="14" y="7" width="4" height="6" rx="1" /></>),
  vmid: icon(<><path d="M3 12h18" /><rect x="6" y="6" width="4" height="12" rx="1" /><rect x="14" y="8" width="4" height="8" rx="1" /></>),
  frontEdge: icon(<><path d="M3 20h18" /><rect x="6" y="7" width="4" height="10" rx="1" /><rect x="14" y="11" width="4" height="6" rx="1" /></>),
  distx: icon(<><path d="M3 4v16M21 4v16" /><rect x="6" y="8" width="4" height="8" rx="1" /><rect x="14" y="8" width="4" height="8" rx="1" /></>),
  disty: icon(<><path d="M4 3h16M4 21h16" /><rect x="8" y="6" width="8" height="4" rx="1" /><rect x="8" y="14" width="8" height="4" rx="1" /></>),
  packx: icon(<><rect x="3" y="8" width="6" height="8" rx="1" /><rect x="9" y="8" width="6" height="8" rx="1" /><path d="M18 12h4M18 12l2-2M18 12l2 2" /></>),
  packy: icon(<><rect x="8" y="3" width="8" height="6" rx="1" /><rect x="8" y="9" width="8" height="6" rx="1" /><path d="M12 18v4M12 18l-2 2M12 18l2 2" /></>),
  turn: icon(<><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /></>),
  undo: icon(<><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>),
  redo: icon(<><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></>),
  folder: icon(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />),
  file: icon(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>),
  download: icon(<><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" /><path d="M5 19h14" /></>),
  plus: icon(<path d="M12 5v14M5 12h14" />),
  close: icon(<path d="M6 6l12 12M18 6L6 18" />),
  trash: icon(<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>),
};
