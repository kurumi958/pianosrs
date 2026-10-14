import { ChevronRight } from 'lucide-react';
import { type ReactNode, useState } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  /** Shown on the right of the header (progress, switches). */
  meta?: ReactNode;
  on?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** A collapsible group on the Lessons and Decks pages. */
export function Group({ title, subtitle, meta, on = false, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`group ${open ? 'open' : ''} ${on ? 'on' : ''}`}>
      <div className="group-head">
        <button className="group-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <ChevronRight size={18} className="chev" />
          <span className="group-title">
            <b>{title}</b>
            {subtitle && <small>{subtitle}</small>}
          </span>
        </button>
        {meta && <div className="group-meta">{meta}</div>}
      </div>
      {open && <div className="group-body">{children}</div>}
    </section>
  );
}

export function Progress({ seen, learned, total }: { seen: number; learned: number; total: number }) {
  return (
    <span className="progress" title={`${seen} started, ${learned} learned, ${total} in all`}>
      <span className="bar">
        <div className="seen" style={{ width: `${(100 * seen) / total}%` }} />
        <div className="mature" style={{ width: `${(100 * learned) / total}%` }} />
      </span>
      <span className="num">
        {learned}/{total}
      </span>
    </span>
  );
}
