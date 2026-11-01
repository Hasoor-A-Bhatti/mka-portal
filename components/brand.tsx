/** Faint emblem and name behind the page. */
export function Watermark() {
  return (
    <div className="watermark" aria-hidden>
      <span className="watermark-seal" />
      <span className="watermark-text">
        Majlis Khuddamul Ahmadiyya
        <small>United Kingdom</small>
      </span>
    </div>
  );
}

/** Organisation footer, the same on every page. */
export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`site-foot ${className}`}>
      <span className="seal is-tiny" aria-hidden>
        <span className="seal-art" />
      </span>
      <p>
        <strong>Majlis Khuddamul Ahmadiyya UK</strong>
        <span>MKA Portal · For internal use only</span>
      </p>
      <small>© {new Date().getFullYear()} Majlis Khuddamul Ahmadiyya UK</small>
    </footer>
  );
}
